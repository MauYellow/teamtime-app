import { api } from '@/lib/api';

// Tabelle delle presenze dei locali (una tabella per locale, SPEC §1.1), tramite il proxy (SPEC §18): stesse righe e
// stessi campi di prima, ma il token Airtable resta sul server. Le altre tabelle (Locali Approvati, New QR Code,
// Assistenza, Supporto, Mail, SendWebLogin) hanno ciascuna la propria operazione del proxy.

export type AirtableRecord<T> = { id: string; createdTime: string; fields: T };

export type ListOptions = {
  filterByFormula?: string;
  sort?: { field: string; direction?: 'asc' | 'desc' }[];
  fields?: string[];
  /** Numero massimo di righe da leggere (default: tutte). */
  maxRecords?: number;
};

/**
 * Testo sicuro da inserire in una formula Airtable tra doppi apici.
 * Esempio: `{Nome} = ${formulaString(nome)}`.
 */
export function formulaString(value: string) {
  return `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
}

/** Righe della tabella delle presenze di un locale (il server gestisce la paginazione). */
export async function listRecords<T>(table: string, options: ListOptions = {}): Promise<AirtableRecord<T>[]> {
  const { records } = await api<{ records: AirtableRecord<T>[] }>('/presenze/list', { table, ...options });
  return records;
}

/** Una riga per ID; errore con codice "not_found" se non esiste più. */
export async function getRecord<T>(table: string, id: string) {
  const { record } = await api<{ record: AirtableRecord<T> }>('/presenze/get', { table, id });
  return record;
}

/**
 * Entrata: nuova riga con Uscita "Al lavoro". Il server riprova senza GPS se la tabella non ha il campo e toglie le righe
 * oltre Max Rows (prima lo faceva il telefono, SPEC §15.2).
 */
export async function createEntry<T>(
  table: string,
  fields: { Nome: string; Entrata: string; Device?: string; GPS?: string },
  /** Dopo un'entrata non riuscita: il proxy controlla prima se era stata scritta comunque (SPEC §15.6 punto 2). */
  checkRecent = false
) {
  return api<{ record: AirtableRecord<T>; trimmed: number; duplicate?: boolean }>('/presenze/entry', {
    table,
    fields,
    checkRecent,
  });
}

/**
 * Scan di uscita in un solo passaggio: il proxy cerca l'ultima riga del dipendente (nome senza maiuscole e spazi) e, se
 * è ancora "al lavoro", scrive l'uscita. "alreadyClosed" con la riga, "noEntry" se non c'è nessuna riga, "tooOld" se il
 * turno è aperto da più di `maxHours` ore (non si chiude in automatico, SPEC §15.6 punto 3).
 */
export function exitLatest<T>(
  table: string,
  name: string,
  fields: { Uscita: string; 'GPS Uscita'?: string },
  maxHours: number
) {
  return api<
    { status: 'done' | 'alreadyClosed' | 'tooOld'; record: AirtableRecord<T> } | { status: 'noEntry'; record?: undefined }
  >('/presenze/exit-latest', { table, name, fields, maxHours });
}

export type ExitOutcome<T> =
  | { status: 'done' | 'alreadyClosed'; record: AirtableRecord<T> }
  | { status: 'gone'; record?: undefined };

/**
 * Uscita su una riga ancora "al lavoro" (scan di uscita, Gestisci, Correggi Orari). Il server rilegge la riga prima di
 * scrivere: "alreadyClosed" se nel frattempo è stata chiusa (con la riga attuale), "gone" se è stata cancellata.
 */
export function setExit<T>(table: string, id: string, fields: { Uscita: string; 'GPS Uscita'?: string }) {
  return api<ExitOutcome<T>>('/presenze/exit', { table, id, fields });
}
