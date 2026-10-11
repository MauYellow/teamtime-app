import { formatTime } from '@/lib/activities';
import {
  AirtableError,
  createRecord,
  deleteRecords,
  formulaString,
  listRecords,
  updateRecord,
  type AirtableRecord,
} from '@/lib/airtable';
import { DEVICE } from '@/lib/device';
import { addRecordToHistory, historyHasEntryToday } from '@/lib/history';
import { fetchLocale, isYes, type LocaleFields } from '@/lib/locali';
import { getCurrentAddress } from '@/lib/location';
import { log } from '@/lib/log';
import { countScanForReview } from '@/lib/review';
import { getSession } from '@/lib/session';
import {
  clearLastScanError,
  getEmployeeLocale,
  getEmployeeName,
  getOldestId,
  saveLastScanError,
  setOldestId,
  type ScanError,
} from '@/lib/storage';
import { scanTelegramText, sendTelegram } from '@/lib/telegram';

// Timbrature di entrata e uscita (SPEC §4.1 e §4.2), come i blocchi "ScriviOrario" e "Scrivi Uscita" di Thunkable.

/** Limite di righe per tabella quando Max Rows manca in Locali Approvati. */
const DEFAULT_MAX_ROWS = 350;

export const SCAN_MESSAGES = {
  ok: 'Scan registrato correttamente.',
  entryCancelled: "Scan di entrata annullato dall'utente.",
  // [interpretazione] il testo originale è troncato negli screenshot ("Il QR Code non risulta essere abbinato all'azien…").
  notLinked: "Il QR Code non risulta essere abbinato all'azienda in cui sei registrato.",
  connection: 'Connessione scarsa o assente. Riprovare fra pochi minuti.',
};

/** Riga della tabella di un locale (presenze). */
type PresenzaFields = {
  Nome?: string;
  Entrata?: string;
  Uscita?: string;
  Device?: string;
  GPS?: string;
  'GPS Uscita'?: string;
  ID?: number;
};

/** Testo di avanzamento mostrato durante la timbratura (Label2 di Thunkable). */
export type ScanStatus = (text: string) => void;

export type ExitResult = { kind: 'done'; message: string } | { kind: 'alreadyOut' } | { kind: 'noEntry' };

function maxRowsOf(locale: LocaleFields | null) {
  const value = Number(locale?.['Max Rows']);
  return Number.isFinite(value) && value > 0 ? value : DEFAULT_MAX_ROWS;
}

/** True se nella copia di Airtable c'è già una presenza di oggi (lib/history.ts: unica fonte, niente dati del telefono). */
export function hasEntryToday() {
  return historyHasEntryToday(getEmployeeLocale(), getEmployeeName());
}

/**
 * Esito di una timbratura per la riga rossa in Home: riuscita → si toglie l'avviso; non riuscita → si ricorda
 * (l'annullamento da parte del dipendente non è un errore).
 */
export function recordScanOutcome(type: ScanError['type'], message: string) {
  if (message === SCAN_MESSAGES.ok) {
    clearLastScanError();
  } else if (message !== SCAN_MESSAGES.entryCancelled) {
    saveLastScanError({ type, message, at: new Date().toISOString() });
  }
}

/** Intercambio: il dipendente può timbrare sul QR di un altro locale solo se il SUO locale ha Intercambio = yes. */
export function canUseOtherLocale() {
  return isYes(getSession().locale?.Intercambio);
}

/**
 * Max Rows della tabella su cui si scrive l'entrata: quello del locale del dipendente, oppure (Intercambio) quello del
 * locale scansionato. Null se il QR scansionato non è un locale di Locali Approvati.
 */
export async function entryMaxRows(scanned: string, ownLocale: string) {
  if (scanned === ownLocale) return maxRowsOf(getSession().locale);
  const other = await fetchLocale(scanned);
  if (!other) return null;
  const maxRows = maxRowsOf(other);
  log(`Cambio variabile Max Row in base a locale in Intercambio: ${maxRows}`);
  return maxRows;
}

/** Testo del campo GPS / GPS Uscita: indirizzo attuale se il locale ha GPS = yes. */
async function gpsText(kind: 'Entrata' | 'Uscita') {
  if (!isYes(getSession().locale?.GPS)) {
    return kind === 'Entrata' ? 'Estensione GPS non attiva' : "Funzione GPS non disponibile per l'utente";
  }
  return (await getCurrentAddress()) ?? 'Posizione non condivisa';
}

/**
 * Scrive su Airtable; se la tabella non ha uno dei campi facoltativi (es. "GPS Uscita" in teamtime_free e Micio)
 * riprova senza quei campi, così la timbratura non si blocca.
 */
async function writeTolerant<T>(
  fields: PresenzaFields,
  optional: (keyof PresenzaFields)[],
  write: (fields: PresenzaFields) => Promise<T>
) {
  try {
    return await write(fields);
  } catch (error) {
    if (!(error instanceof AirtableError) || error.status !== 422 || !error.message.includes('UNKNOWN_FIELD_NAME')) {
      throw error;
    }
    log(`Campo assente nella tabella, riprovo senza ${optional.join(', ')}`);
    const reduced = { ...fields };
    optional.forEach((key) => delete reduced[key]);
    return write(reduced);
  }
}

function responseText(record: AirtableRecord<PresenzaFields>) {
  return JSON.stringify({ id: record.id, createdTime: record.createdTime, fields: record.fields });
}

/**
 * Limite righe (Max Rows), come l'app Thunkable: una riga va cancellata quando tra il suo ID e quello della riga appena
 * creata ci sono almeno Max Rows righe. Il portale dà per scontato questo limite. Un errore qui non blocca la timbratura.
 *
 * [miglioria, SPEC §15.2] Thunkable a ogni entrata leggeva l'ID più basso e quello più alto e cancellava una riga
 * (3 chiamate). Ora l'ID più alto arriva dalla risposta della creazione, l'ID più basso è ricordato sul telefono e si
 * rilegge solo quando si arriva al limite; le righe in eccesso si cancellano insieme (fino a 10 per chiamata).
 * Se altri telefoni o il portale cancellano righe, l'ID ricordato è solo più basso del vero: si ricontrolla prima,
 * senza cancellare nulla di troppo.
 */
async function trimTable(table: string, maxRows: number, newId: number | undefined) {
  if (newId === undefined) return;
  const oldestId = getOldestId(table);
  // newId < oldestId: la tabella è stata ricreata (gli ID ripartono), il valore ricordato non vale più.
  if (oldestId !== null && newId >= oldestId && newId - oldestId < maxRows) return;

  try {
    const oldest = await listRecords<PresenzaFields>(table, {
      fields: ['ID'],
      sort: [{ field: 'ID', direction: 'asc' }],
      maxRecords: 10,
    });
    const excess = oldest.filter((record) => record.fields.ID !== undefined && newId - record.fields.ID >= maxRows);
    if (excess.length > 0) {
      await deleteRecords(
        table,
        excess.map((record) => record.id)
      );
      log(`[API Airtable] Limite ${maxRows} righe: cancellate ${excess.length} righe vecchie (${table})`);
    }
    const remaining = oldest.find((record) => !excess.includes(record));
    const lastDeleted = excess[excess.length - 1]?.fields.ID;
    const nextOldest = remaining?.fields.ID ?? (lastDeleted !== undefined ? lastDeleted + 1 : undefined);
    if (nextOldest !== undefined) setOldestId(table, nextOldest);
    log(`Riga con ID minore: ${nextOldest}, ID nuova riga: ${newId}`);
  } catch (error) {
    log(`Ridimensionamento database non riuscito: ${String(error)}`);
  }
}

/** Scrive l'entrata nella tabella del locale scansionato. Restituisce il messaggio per Scan Result. */
export async function registerEntry(table: string, maxRows: number, onStatus: ScanStatus) {
  const name = getEmployeeName() ?? '';
  const now = new Date();
  const time = formatTime(now);

  onStatus('Aggiornamento del database..');
  const fields: PresenzaFields = { Nome: name, Entrata: time, Uscita: 'Al lavoro', Device: DEVICE, GPS: await gpsText('Entrata') };
  let record: AirtableRecord<PresenzaFields>;
  try {
    record = await writeTolerant(fields, ['GPS'], (data) => createRecord<PresenzaFields>(table, data));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    log(`[API Airtable] Errore entrata: ${message}`);
    sendTelegram(scanTelegramText(name, table, 'Entrata', `Errore: ${message}`));
    return `Errore: ${message}`;
  }
  const response = responseText(record);
  log(`[API Airtable]: ${response}`);
  sendTelegram(scanTelegramText(name, table, 'Entrata', response));

  onStatus('Ridimensionamento database..');
  await trimTable(table, maxRows, record.fields.ID);

  onStatus('Salvataggio dati nel dispositivo..');
  // La riga restituita da Airtable (stessa chiamata) va nella copia: Home e Accesso Dipendenti si aggiornano subito.
  addRecordToHistory(table, record);
  countScanForReview();
  onStatus('Completato');
  return SCAN_MESSAGES.ok;
}

/**
 * Scrive l'uscita sull'ultima riga del dipendente nella tabella del locale scansionato.
 * "alreadyOut" se l'ultima riga non è "al lavoro" (l'app mostra l'avviso e non apre Scan Result).
 */
export async function registerExit(table: string, onStatus: ScanStatus): Promise<ExitResult> {
  const name = getEmployeeName() ?? '';
  onStatus('Ricerca della tua entrata..');
  log('[API Airtable] Inizio scrittura per scan di uscita');

  let latest: AirtableRecord<PresenzaFields> | undefined;
  try {
    // [miglioria] nome confrontato in modo esatto, senza maiuscole e spazi (l'originale usava FIND, che
    // trovava anche "Mario Rossini" cercando "Mario Rossi").
    [latest] = await listRecords<PresenzaFields>(table, {
      filterByFormula: `LOWER(TRIM({Nome})) = LOWER(TRIM(${formulaString(name)}))`,
      sort: [{ field: 'ID', direction: 'desc' }],
      maxRecords: 1,
    });
  } catch (error) {
    log(`Errore lettura righe per l'uscita: ${String(error)}`);
    sendTelegram(scanTelegramText(name, table, 'Uscita', `Errore: ${String(error)}`));
    return { kind: 'done', message: SCAN_MESSAGES.connection };
  }

  // [miglioria] "Al lavoro" senza distinguere maiuscole: il portale scrive "Al Lavoro".
  // Il bottone Uscita è sempre attivo: chi non ha nessuna riga su questa tabella riceve un avviso suo.
  if (!latest) {
    log('Nessuna entrata del dipendente su questa tabella');
    return { kind: 'noEntry' };
  }
  if (latest.fields.Uscita?.trim().toLowerCase() !== 'al lavoro') {
    log('Ultima riga del dipendente già con uscita');
    return { kind: 'alreadyOut' };
  }
  log(`[API Airtable] Riconosciuto che l'ultimo accesso è "Al lavoro": ${latest.id}`);

  onStatus('Aggiornamento del database..');
  const now = new Date();
  const time = formatTime(now);
  const fields: PresenzaFields = { Uscita: time, 'GPS Uscita': await gpsText('Uscita') };
  let record: AirtableRecord<PresenzaFields>;
  try {
    record = await writeTolerant(fields, ['GPS Uscita'], (data) =>
      updateRecord<PresenzaFields>(table, latest.id, data)
    );
  } catch (error) {
    log(`Errore dopo aver riconosciuto l'uscita: ${String(error)}`);
    sendTelegram(scanTelegramText(name, table, 'Uscita', `Errore: ${String(error)}`));
    return { kind: 'done', message: SCAN_MESSAGES.connection };
  }
  const response = responseText(record);
  log(`[API Airtable]: ${response}`);
  sendTelegram(scanTelegramText(name, table, 'Uscita', response));

  onStatus('Salvataggio dati nel dispositivo..');
  addRecordToHistory(table, record);
  countScanForReview();
  onStatus('Completato');
  return { kind: 'done', message: SCAN_MESSAGES.ok };
}
