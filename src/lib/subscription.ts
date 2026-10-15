import Storage from 'expo-sqlite/kv-store';
import { Platform } from 'react-native';
import Purchases, { LOG_LEVEL, type CustomerInfo, type PurchasesEntitlementInfo } from 'react-native-purchases';
import RevenueCatUI, { PAYWALL_RESULT } from 'react-native-purchases-ui';

import { ANDROID_PACKAGE, REVENUECAT_ANDROID_KEY, REVENUECAT_IOS_KEY } from '@/config';
import { api } from '@/lib/api';
import { writeCache } from '@/lib/cache';
import { localeCacheKey, type LocaleFields } from '@/lib/locali';
import { log } from '@/lib/log';
import { reportError } from '@/lib/sentry';
import { getSession, updateSession } from '@/lib/session';

// Abbonamento in-app con RevenueCat (SPEC §17). Il titolare compra dall'app (prova gratis 30 giorni, poi annuale):
// il proxy (SPEC §18), dopo aver verificato l'acquisto su RevenueCat con la chiave segreta, attiva il locale come fa il
// portale con Stripe (stesse tabelle e campi) e scrive "Apple" o "Android" in "Metodo di pagamento". Le righe e il flusso Stripe non si toccano mai: l'app non scrive "Stripe" e non legge né
// modifica "Stripe Customer ID".
// ID utente RevenueCat = nome della tabella del locale (es. teamtime032): l'abbonamento è del locale, non del telefono.

/** Entitlement dato da tutti e tre i piani. */
export const ENTITLEMENT = 'teamtime_pro';

const PENDING_KEY = 'attivazioneInSospeso';

export type StoreMethod = 'Apple' | 'Android';

/** Dati chiesti prima del paywall, come il modulo del portale. */
export type CompanyData = {
  ragioneSociale: string;
  partitaIva: string;
  indirizzo: string;
  mail: string;
  telefono: string;
};

let configured = false;

/** Da chiamare una volta all'avvio. Senza chiavi in .env l'abbonamento resta spento (l'app funziona lo stesso). */
export function configurePurchases() {
  if (configured) return;
  const apiKey = Platform.OS === 'ios' ? REVENUECAT_IOS_KEY : REVENUECAT_ANDROID_KEY;
  if (!apiKey) {
    log('RevenueCat: chiave assente, abbonamento disattivato');
    return;
  }
  try {
    if (__DEV__) Purchases.setLogLevel(LOG_LEVEL.WARN);
    Purchases.configure({ apiKey });
    configured = true;
  } catch (error) {
    log(`RevenueCat: configurazione non riuscita ${String(error)}`);
  }
}

export function isPurchasesReady() {
  return configured;
}

/** "Apple" / "Android" se il locale paga dagli store; null per Stripe, vuoto o altro. */
export function storeMethod(locale: LocaleFields | null | undefined): StoreMethod | null {
  const value = locale?.['Metodo di pagamento']?.trim().toLowerCase();
  if (value === 'apple') return 'Apple';
  if (value === 'android') return 'Android';
  return null;
}

function activeEntitlement(info: CustomerInfo): PurchasesEntitlementInfo | undefined {
  return info.entitlements.active[ENTITLEMENT];
}

/** Pagina degli abbonamenti dello store, per disdire o gestire. */
export function storeSubscriptionsUrl(method: StoreMethod | null) {
  return method === 'Android' || (!method && Platform.OS === 'android')
    ? `https://play.google.com/store/account/subscriptions?package=${ANDROID_PACKAGE}`
    : 'https://apps.apple.com/account/subscriptions';
}

// --- Paywall ---

export type PaywallOutcome = { purchased: true; info: CustomerInfo } | { purchased: false; error?: boolean };

/** Mostra il paywall disegnato su RevenueCat (offering "default"). */
export async function showPaywall(): Promise<PaywallOutcome> {
  if (!configured) return { purchased: false, error: true };
  try {
    const result = await RevenueCatUI.presentPaywall({ displayCloseButton: true });
    log(`Paywall: ${result}`);
    if (result !== PAYWALL_RESULT.PURCHASED && result !== PAYWALL_RESULT.RESTORED) {
      return { purchased: false, error: result === PAYWALL_RESULT.ERROR };
    }
    const info = await Purchases.getCustomerInfo();
    return activeEntitlement(info) ? { purchased: true, info } : { purchased: false, error: true };
  } catch (error) {
    log(`Paywall: errore ${String(error)}`);
    reportError(error, 'paywall');
    return { purchased: false, error: true };
  }
}

/**
 * Prova gratuita di un'azienda nuova: il telefono torna "anonimo" (potrebbe essere collegato al locale di cui è
 * dipendente o manager), così l'acquisto non finisce su un altro locale. Poi il paywall.
 */
export async function startTrialPaywall(): Promise<PaywallOutcome> {
  if (!configured) return { purchased: false, error: true };
  try {
    if (!(await Purchases.isAnonymous())) await Purchases.logOut();
  } catch (error) {
    log(`RevenueCat: logOut non riuscito ${String(error)}`);
  }
  return showPaywall();
}

// --- Attivazione del locale (come /start-airtable del portale, fatta dal proxy) ---

/**
 * Attivazione in corso, salvata sul telefono: se si interrompe (connessione persa, app chiusa) si riprova con gli stessi
 * dati. Il proxy ricorda su RevenueCat la tabella assegnata a quell'acquisto, quindi non scrive mai due volte.
 */
type PendingActivation = { data: CompanyData; at: string };

/** Acquisto fatto ma attivazione non finita: la schermata della prova propone di completarla. */
export function getPendingActivation(): PendingActivation | null {
  try {
    const json = Storage.getItemSync(PENDING_KEY);
    return json ? (JSON.parse(json) as PendingActivation) : null;
  } catch {
    return null;
  }
}

export function clearPendingActivation() {
  Storage.removeItemSync(PENDING_KEY);
}

/**
 * `test`: acquisto di prova (sandbox). `written`: con `test`, se è stato scritto davvero (build di sviluppo, stessa
 * tabella che avrebbe un acquisto reale) oppure niente (TestFlight e simili).
 */
export type Activation = { locale: LocaleFields; password: string; test?: boolean; written?: boolean };

type ActivationResponse = {
  table: string | null;
  password: string;
  test: boolean;
  written: boolean;
  locale: LocaleFields;
};

/**
 * Dopo l'acquisto: il proxy controlla l'abbonamento su RevenueCat (ID del telefono al momento dell'acquisto) e fa gli
 * stessi passi del portale (prima tabella vuota tra teamtime021 e teamtime050 prenotata, Locali Approvati, riga in
 * SendWebLogin per la mail con password e QR, Telegram). Poi l'app collega l'abbonamento al locale su RevenueCat
 * (ID utente = nome della tabella; negli acquisti di prova "test_<tabella>", mai il locale vero).
 * Acquisti di prova (sandbox): build di sviluppo → tutto vero, sulla prima tabella vuota come un acquisto reale
 * (dal 15/10/2026; prima solo teamtime037); altrimenti nessuna scrittura.
 * Con `data` assente riprende l'attivazione in sospeso.
 */
export async function activateLocale(data?: CompanyData): Promise<Activation> {
  const pending: PendingActivation = (!data && getPendingActivation()) || {
    data: data as CompanyData,
    at: new Date().toISOString(),
  };
  if (!pending.data) throw new Error('Nessuna attivazione in sospeso');
  Storage.setItemSync(PENDING_KEY, JSON.stringify(pending));

  const appUserId = await Purchases.getAppUserID();
  const result = await api<ActivationResponse>('/subscription/activate', {
    appUserId,
    company: pending.data,
    devTest: __DEV__,
  });
  if (result.table) {
    try {
      await Purchases.logIn(result.test ? `test_${result.table}` : result.table);
    } catch (error) {
      // Il locale è attivo; il collegamento si rifà al prossimo controllo dell'abbonamento.
      log(`RevenueCat: logIn dopo l'attivazione non riuscito ${String(error)}`);
    }
  }
  clearPendingActivation();
  log(`Abbonamento in-app: attivato ${result.table ?? 'nessuna tabella'}${result.test ? ' [PROVA]' : ''}`);
  return { locale: result.locale, password: result.password, test: result.test, written: result.written };
}

// --- Stato dell'abbonamento su Airtable (al posto di un webhook) ---

/**
 * Per i locali che pagano dagli store: il proxy legge l'abbonamento del locale su RevenueCat e aggiorna Status/Pagato su
 * Airtable solo se sono cambiati. Attivo in prova → Pagato No; attivo pagato → Pagato Si; scaduto → Disattivato (a fine
 * periodo pagato, come gli store). Si chiama all'apertura dell'app del dipendente e all'ingresso del manager.
 * Locali Stripe o senza metodo: non fa niente. [SPEC §18] Il telefono non fa più logIn sul locale per controllarlo.
 */
export async function syncSubscription(locale: LocaleFields | null | undefined): Promise<LocaleFields | null> {
  const table = locale?.Locale;
  if (!storeMethod(locale) || !table) return null;
  try {
    const result = await api<{ changed: boolean; Status?: string; Pagato?: string }>('/subscription/sync', { table });
    if (!result.changed) return null;
    const patch: Partial<LocaleFields> = { Status: result.Status, Pagato: result.Pagato };
    log(`Abbonamento ${table}: ${JSON.stringify(patch)}`);
    return applyToSession(table, patch);
  } catch (error) {
    log(`Abbonamento ${table}: controllo non riuscito ${String(error)}`);
    reportError(error, 'syncSubscription');
    return null;
  }
}

/** Il nuovo stato vale subito per l'area manager e per il dipendente, se è lo stesso locale. */
function applyToSession(table: string, patch: Partial<LocaleFields>) {
  const session = getSession();
  const update: { manager?: LocaleFields; locale?: LocaleFields } = {};
  if (session.manager?.Locale === table) update.manager = { ...session.manager, ...patch };
  if (session.locale?.Locale === table) update.locale = { ...session.locale, ...patch };
  if (update.manager || update.locale) updateSession(update);
  const fields = update.manager ?? update.locale ?? { Locale: table, ...patch };
  if (update.locale) writeCache(localeCacheKey(table), update.locale);
  return fields;
}

/** Rinnovo dal Registro Online di un locale scaduto: paywall collegato a quel locale, poi stato riletto. */
export async function renewSubscription(locale: LocaleFields): Promise<LocaleFields | null> {
  if (!configured || !locale.Locale) return null;
  try {
    await Purchases.logIn(locale.Locale);
  } catch (error) {
    log(`RevenueCat: logIn non riuscito ${String(error)}`);
    return null;
  }
  const outcome = await showPaywall();
  if (!outcome.purchased) return null;
  return syncSubscription(locale);
}

/** Link di gestione dell'abbonamento del locale (disdetta, metodo di pagamento). */
export async function managementUrl(locale: LocaleFields | null | undefined) {
  const method = storeMethod(locale);
  if (configured && locale?.Locale) {
    try {
      const { customerInfo } = await Purchases.logIn(locale.Locale);
      if (customerInfo.managementURL) return customerInfo.managementURL;
    } catch {
      // si usa la pagina generica dello store
    }
  }
  return storeSubscriptionsUrl(method);
}
