import { findFirst, formulaString, listRecords } from '@/lib/airtable';

// Tabella "Locali Approvati": un record per ogni locale cliente (vedi SPEC §1.1).

export const LOCALI_TABLE = 'Locali Approvati';

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
};

/** I campi GPS e Intercambio contengono valori misti ("yes", "no", "No GPS"...): attivo solo se "yes". */
export function isYes(value: string | undefined) {
  return value?.trim().toLowerCase() === 'yes';
}

/** Record del locale con quel nome (sensibile alle maiuscole, come Thunkable), o null. */
export async function fetchLocale(locale: string) {
  const record = await findFirst<LocaleFields>(LOCALI_TABLE, `{Locale} = ${formulaString(locale)}`);
  return record?.fields ?? null;
}

/** Chiave della cache del record di un locale. */
export function localeCacheKey(locale: string) {
  return `locale:${locale}`;
}


/** Elenco dei nomi di tutti i locali (Accesso Dipendenti e controllo del QR). */
export async function fetchLocaleNames() {
  const records = await listRecords<LocaleFields>(LOCALI_TABLE, { fields: ['Locale', 'Status'] });
  return records
    .map((record) => ({ locale: record.fields.Locale?.trim() ?? '', status: record.fields.Status ?? '' }))
    .filter((item) => item.locale.length > 0);
}
