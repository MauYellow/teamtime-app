import Storage from 'expo-sqlite/kv-store';
import { Platform } from 'react-native';
import Purchases, { LOG_LEVEL, type CustomerInfo, type PurchasesEntitlementInfo } from 'react-native-purchases';
import RevenueCatUI, { PAYWALL_RESULT } from 'react-native-purchases-ui';

import { ANDROID_PACKAGE, REVENUECAT_ANDROID_KEY, REVENUECAT_IOS_KEY } from '@/config';
import { formatTime } from '@/lib/activities';
import { createRecord, findFirst, formulaString, listRecords, updateRecord, type AirtableRecord } from '@/lib/airtable';
import { writeCache } from '@/lib/cache';
import { DEVICE } from '@/lib/device';
import { LOCALI_TABLE, localeCacheKey, type LocaleFields } from '@/lib/locali';
import { log } from '@/lib/log';
import { getSession, updateSession } from '@/lib/session';
import { sendTelegram } from '@/lib/telegram';

// Abbonamento in-app con RevenueCat (SPEC §17). Il titolare compra dall'app (prova gratis 30 giorni, poi annuale):
// l'app attiva il locale come fa il portale con Stripe (stesse tabelle e campi) e scrive "Apple" o "Android" in
// "Metodo di pagamento". Le righe e il flusso Stripe non si toccano mai: l'app non scrive "Stripe" e non legge né
// modifica "Stripe Customer ID".
// ID utente RevenueCat = nome della tabella del locale (es. teamtime032): l'abbonamento è del locale, non del telefono.

/** Entitlement dato da tutti e tre i piani. */
export const ENTITLEMENT = 'teamtime_pro';

/** Piani: il prodotto acquistato decide i dipendenti massimi (come i piani del sito). */
const PLANS = [
  { product: 'teamtime_start_annuale', name: 'START', maxEmployees: '5' },
  { product: 'teamtime_teams_annuale', name: 'TEAMS', maxEmployees: '11' },
  { product: 'teamtime_business_annuale', name: 'BUSINESS', maxEmployees: '99999' },
] as const;

/** Tabelle che il portale assegna ai nuovi clienti: la prima vuota tra teamtime021 e teamtime050. */
const FIRST_TABLE = 21;
const LAST_TABLE = 50;

const SEND_WEB_LOGIN_TABLE = 'SendWebLogin';
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

function planOf(productId: string | undefined) {
  // Su Google l'identificativo può avere il piano base dopo i due punti (teamtime_start_annuale:annuale).
  return PLANS.find((plan) => productId?.startsWith(plan.product)) ?? PLANS[0];
}

/** Data come la scrive il portale (str(datetime) di Python): "AAAA-MM-GG HH:MM:SS.ffffff". */
function pythonDate(date: Date) {
  const pad = (value: number) => String(value).padStart(2, '0');
  return (
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ` +
    `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}.` +
    `${String(date.getMilliseconds()).padStart(3, '0')}000`
  );
}

/** Password casuale di 8 lettere e numeri, come il portale. */
function randomPassword() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  return Array.from({ length: 8 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
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

// --- Attivazione del locale (come /start-airtable del portale) ---

/** Prima tabella vuota tra teamtime021 e teamtime050 che ha la sua riga in Locali Approvati. */
async function findEmptyTable() {
  for (let number = FIRST_TABLE; number <= LAST_TABLE; number++) {
    const table = `teamtime0${String(number).padStart(2, '0')}`;
    try {
      const rows = await listRecords(table, { maxRecords: 1, fields: ['Nome'] });
      if (rows.length > 0) continue;
      const locale = await findFirst<LocaleFields>(LOCALI_TABLE, `{Locale} = ${formulaString(table)}`);
      if (locale) return locale;
    } catch {
      // Tabella che non esiste: si passa alla successiva, come il portale.
    }
  }
  return null;
}

/**
 * Attivazione in corso, salvata sul telefono passo per passo: se si interrompe (connessione persa, app chiusa) si
 * riprende dalla stessa tabella senza scrivere due volte.
 */
type PendingActivation = {
  data: CompanyData;
  at: string;
  table?: string;
  password?: string;
  rowDone?: boolean;
  localeDone?: boolean;
};

/** Acquisto fatto ma attivazione non finita: la schermata della prova propone di completarla. */
export function getPendingActivation(): PendingActivation | null {
  try {
    const json = Storage.getItemSync(PENDING_KEY);
    return json ? (JSON.parse(json) as PendingActivation) : null;
  } catch {
    return null;
  }
}

function savePending(pending: PendingActivation) {
  Storage.setItemSync(PENDING_KEY, JSON.stringify(pending));
}

/** `test`: acquisto di prova (sandbox), niente è stato scritto su Airtable. */
export type Activation = { locale: LocaleFields; password: string; test?: boolean };

/**
 * Dopo l'acquisto: sceglie la tabella, collega l'abbonamento al locale, scrive la riga "Attivazione TeamTime",
 * aggiorna Locali Approvati e crea la riga in SendWebLogin (parte la mail con password e QR, come dal portale).
 * Con `data` assente riprende l'attivazione in sospeso.
 */
export async function activateLocale(data?: CompanyData): Promise<Activation> {
  const pending: PendingActivation = (!data && getPendingActivation()) || {
    data: data as CompanyData,
    at: new Date().toISOString(),
  };
  if (!pending.data) throw new Error('Nessuna attivazione in sospeso');
  savePending(pending);
  const company = pending.data;
  const method: StoreMethod = Platform.OS === 'ios' ? 'Apple' : 'Android';

  // 1. Tabella: la prima vuota (come il portale), oppure quella già scelta.
  const record = pending.table
    ? await findFirst<LocaleFields>(LOCALI_TABLE, `{Locale} = ${formulaString(pending.table)}`)
    : await findEmptyTable();
  if (!record?.fields.Locale) {
    sendTelegram(
      `*Abbonamento in-app SENZA TABELLA LIBERA*: ${company.ragioneSociale}, ${company.mail}, ${company.telefono} (${method})`
    );
    throw new Error('Nessuna tabella disponibile');
  }
  const table = record.fields.Locale;

  // Acquisto di prova (sandbox: build di sviluppo, TestFlight, tester delle licenze Google): non si toccano le tabelle
  // dei clienti. Si collega a un ID RevenueCat "test_…" e su Telegram arriva cosa sarebbe stato scritto.
  const before = await Purchases.getCustomerInfo();
  if (activeEntitlement(before)?.isSandbox) {
    await Purchases.logIn(`test_${table}`);
    Storage.removeItemSync(PENDING_KEY);
    const plan = planOf(activeEntitlement(before)?.productIdentifier);
    log(`Abbonamento in-app PROVA: sarebbe stato attivato ${table} (${plan.name}, ${method})`);
    sendTelegram(
      `*PROVA abbonamento in-app* (sandbox, ${method}, ${plan.name}): sarebbe stata usata ${table} per ` +
        `${company.ragioneSociale}, ${company.mail}. Nessuna scrittura su Airtable.`
    );
    return { locale: { ...record.fields, Nome: company.ragioneSociale }, password: 'PROVA', test: true };
  }

  pending.table = table;
  pending.password ??= randomPassword();
  savePending(pending);

  // 2. L'abbonamento passa dal telefono "anonimo" al locale.
  const { customerInfo } = await Purchases.logIn(table);
  const entitlement = activeEntitlement(customerInfo);
  const plan = planOf(entitlement?.productIdentifier);
  const inTrial = entitlement?.periodType === 'TRIAL';
  const trialEnd =
    inTrial && entitlement?.expirationDate
      ? new Date(entitlement.expirationDate)
      : new Date(Date.now() + 30 * 86_400_000);
  const fineProva = pythonDate(trialEnd);

  // 3. Prima riga della tabella, come il portale.
  if (!pending.rowDone) {
    const now = formatTime(new Date());
    await createRecord(table, {
      Nome: 'Attivazione TeamTime',
      Entrata: now,
      Uscita: now,
      Device: DEVICE,
      GPS: 'Privato',
      'GPS Uscita': 'Privato',
    });
    pending.rowDone = true;
    savePending(pending);
  }

  // 4. Locali Approvati, stessi campi del portale (tranne Stripe Customer ID) più "Metodo di pagamento".
  let fields = record.fields;
  if (!pending.localeDone) {
    const updated = await updateRecord<LocaleFields>(LOCALI_TABLE, record.id, {
      Mail: company.mail,
      Password: pending.password,
      Nome: company.ragioneSociale,
      'Primo Accesso': 'yes',
      Telefono: company.telefono,
      GPS: 'no',
      Intercambio: 'no',
      'Max Dipendenti': plan.maxEmployees,
      'Ragione Sociale': company.ragioneSociale,
      'Partita IVA': company.partitaIva,
      Indirizzo: company.indirizzo,
      'Link Annullamento': customerInfo.managementURL ?? storeSubscriptionsUrl(method),
      'Fine Prova': fineProva,
      Status: 'Attivo',
      Pagato: inTrial ? 'No' : 'Si',
      Referral: '-',
      'Metodo di pagamento': method,
    });
    fields = updated.fields;
    pending.localeDone = true;
    savePending(pending);
  }

  // 5. Mail con password e PDF del QR (automazione Airtable di SendWebLogin, la stessa del portale).
  const qrPdf = record.fields['QR Code PDF']?.[0]?.url;
  await createRecord(SEND_WEB_LOGIN_TABLE, {
    Mail: company.mail,
    Password: pending.password,
    Telefono: company.telefono,
    'Max Dipendenti': plan.maxEmployees,
    GPS: 'no',
    Interscambio: 'no',
    'Fine Prova': fineProva,
    Locale: table,
    ...(qrPdf ? { Attachment: [{ url: qrPdf }] } : {}),
  });

  Storage.removeItemSync(PENDING_KEY);
  log(`Abbonamento in-app: attivato ${table} (${plan.name}, ${method})`);
  sendTelegram(
    `*Nuova prova gratuita dall'app* (${method}, ${plan.name}): ${table} — ${company.ragioneSociale}, ${company.mail}`
  );
  return { locale: fields, password: pending.password };
}

// --- Stato dell'abbonamento su Airtable (al posto di un webhook) ---

/**
 * Per i locali che pagano dagli store: legge l'abbonamento del locale su RevenueCat e aggiorna Status/Pagato su
 * Airtable solo se sono cambiati. Attivo in prova → Pagato No; attivo pagato → Pagato Si; scaduto → Disattivato (a fine
 * periodo pagato, come gli store). Si chiama all'apertura dell'app del dipendente e all'ingresso del manager.
 * Locali Stripe o senza metodo: non fa niente.
 */
export async function syncSubscription(locale: LocaleFields | null | undefined): Promise<LocaleFields | null> {
  const method = storeMethod(locale);
  const table = locale?.Locale;
  if (!configured || !method || !table) return null;
  try {
    const { customerInfo } = await Purchases.logIn(table);
    // Mai visto un abbonamento per questo locale (es. attivazione a metà): meglio non disattivarlo.
    if (!customerInfo.entitlements.all[ENTITLEMENT]) {
      log(`Abbonamento ${table}: nessun acquisto su RevenueCat, stato non modificato`);
      return null;
    }
    const entitlement = activeEntitlement(customerInfo);
    const wanted: Partial<LocaleFields> = entitlement
      ? { Status: 'Attivo', Pagato: entitlement.periodType === 'TRIAL' ? 'No' : 'Si' }
      : { Status: 'Disattivato' };
    const changed = Object.entries(wanted).some(([key, value]) => locale[key as keyof LocaleFields] !== value);
    if (!changed) return null;

    const record = await findFirst<LocaleFields>(LOCALI_TABLE, `{Locale} = ${formulaString(table)}`);
    if (!record) return null;
    const updated = await updateRecord<LocaleFields>(LOCALI_TABLE, record.id, wanted);
    applyToSession(updated);
    log(`Abbonamento ${table}: ${JSON.stringify(wanted)}`);
    sendTelegram(`Abbonamento in-app ${table} (${method}): ${JSON.stringify(wanted)}`);
    return updated.fields;
  } catch (error) {
    log(`Abbonamento ${table}: controllo non riuscito ${String(error)}`);
    return null;
  }
}

/** Il record aggiornato vale subito per l'area manager e per il dipendente, se è lo stesso locale. */
function applyToSession(record: AirtableRecord<LocaleFields>) {
  const name = record.fields.Locale;
  const session = getSession();
  const patch: { manager?: LocaleFields; locale?: LocaleFields } = {};
  if (session.manager?.Locale === name) patch.manager = record.fields;
  if (session.locale?.Locale === name) patch.locale = record.fields;
  if (patch.manager || patch.locale) updateSession(patch);
  if (name) writeCache(localeCacheKey(name), record.fields);
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
