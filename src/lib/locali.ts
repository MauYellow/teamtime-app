import { api } from '@/lib/api';

// Tabella "Locali Approvati": un record per ogni locale cliente (vedi SPEC §1.1), letta tramite il proxy (SPEC §18).

export type LocaleFields = {
  Locale?: string;
  Nome?: string;
  Mail?: string;
  Password?: string;
  Status?: string;
  Pagato?: string;
  GPS?: string;
  Intercambio?: string;
  'Max Rows'?: number;
  'Max Dipendenti'?: string;
  'URL Monitor'?: string;
  'Monitor Ore Mensili'?: string;
  'Fine Prova'?: string;
  'Ragione Sociale'?: string;
  /** Impostazioni del locale in JSON (vedi lib/preferences.ts). */
  Impostazioni?: string;
  Telefono?: string;
  'Partita IVA'?: string;
  Indirizzo?: string;
  'Primo Accesso'?: string;
  'Link Annullamento'?: string;
  'Stripe Customer ID'?: string;
  Referral?: string;
  'QR Code PDF'?: { url: string }[];
  /** "Apple" / "Android" (acquisto in-app) o "Stripe" (portale). Colonna creata dall'utente il 12/10/2026. */
  'Metodo di pagamento'?: string;
};

/** I campi GPS e Intercambio contengono valori misti ("yes", "no", "No GPS"...): attivo solo se "yes". */
export function isYes(value: string | undefined) {
  return value?.trim().toLowerCase() === 'yes';
}

/**
 * Campi del locale con quel nome (sensibile alle maiuscole, come Thunkable), o null. Tramite il proxy arrivano solo i
 * campi pubblici (Locale, Nome, Status, GPS, Intercambio, Max Rows, Impostazioni, Metodo di pagamento): mai password e
 * dati del titolare (SPEC §18).
 */
export async function fetchLocale(locale: string) {
  const result = await api<{ locale: LocaleFields | null }>('/locali/get', { locale });
  return result.locale;
}

/** Chiave della cache del record di un locale. */
export function localeCacheKey(locale: string) {
  return `locale:${locale}`;
}


/** Elenco dei nomi di tutti i locali (Accesso Dipendenti e controllo del QR). */
export async function fetchLocaleNames() {
  return api<{ locale: string; status: string }[]>('/locali/names');
}
