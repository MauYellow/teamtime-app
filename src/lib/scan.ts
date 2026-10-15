import { formatTime } from '@/lib/activities';
import { createEntry, formulaString, listRecords, setExit, type AirtableRecord } from '@/lib/airtable';
import { DEVICE } from '@/lib/device';
import { addRecordToHistory } from '@/lib/history';
import { fetchLocale, isYes } from '@/lib/locali';
import { getCurrentAddress } from '@/lib/location';
import { log } from '@/lib/log';
import { countScanForReview } from '@/lib/review';
import { getSession } from '@/lib/session';
import { clearLastScanError, getEmployeeName, saveLastScanError, type ScanError } from '@/lib/storage';
import { scanTelegramText, sendTelegram } from '@/lib/telegram';

// Timbrature di entrata e uscita (SPEC §4.1 e §4.2), come i blocchi "ScriviOrario" e "Scrivi Uscita" di Thunkable.

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

/**
 * Messaggio comprensibile per il dipendente ("Scan non riuscito: motivo. Riprova"). Il messaggio tecnico resta nel log
 * e nel report per lo sviluppatore.
 */
export function friendlyScanMessage(message: string) {
  if (message === SCAN_MESSAGES.ok || message === SCAN_MESSAGES.entryCancelled) return message;
  if (message === SCAN_MESSAGES.connection) {
    return 'Scan non riuscito: la connessione è assente o troppo lenta. Controlla la rete e riprova.';
  }
  if (message === SCAN_MESSAGES.notLinked) {
    return 'Scan non riuscito: questo QR Code non è collegato alla tua azienda. Controlla di inquadrare il QR giusto e riprova.';
  }
  return 'Scan non riuscito: il registro online non ha accettato la timbratura. Riprova tra qualche minuto.';
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
 * True se il QR scansionato è un locale di Locali Approvati (il proprio sempre). [SPEC §18] Max Rows non serve più qui:
 * le righe oltre il limite le toglie il proxy.
 */
export async function isKnownLocale(scanned: string, ownLocale: string) {
  if (scanned === ownLocale) return true;
  const other = await fetchLocale(scanned);
  if (other) log(`Intercambio: ${scanned} riconosciuto`);
  return !!other;
}

/** Testo del campo GPS / GPS Uscita: indirizzo attuale se il locale ha GPS = yes. */
async function gpsText(kind: 'Entrata' | 'Uscita') {
  if (!isYes(getSession().locale?.GPS)) {
    return kind === 'Entrata' ? 'Estensione GPS non attiva' : "Funzione GPS non disponibile per l'utente";
  }
  return (await getCurrentAddress()) ?? 'Posizione non condivisa';
}

function responseText(record: AirtableRecord<PresenzaFields>) {
  return JSON.stringify({ id: record.id, createdTime: record.createdTime, fields: record.fields });
}

/**
 * Scrive l'entrata nella tabella del locale scansionato. Restituisce il messaggio per Scan Result.
 * [SPEC §18] Tramite il proxy, che riprova senza GPS se la tabella non ha il campo e toglie le righe oltre Max Rows
 * (prima lo faceva il telefono: SPEC §15.2).
 */
export async function registerEntry(table: string, onStatus: ScanStatus) {
  const name = getEmployeeName() ?? '';
  const time = formatTime(new Date());

  onStatus('Aggiornamento del database..');
  let record: AirtableRecord<PresenzaFields>;
  try {
    const result = await createEntry<PresenzaFields>(table, {
      Nome: name,
      Entrata: time,
      Device: DEVICE,
      GPS: await gpsText('Entrata'),
    });
    record = result.record;
    if (result.trimmed > 0) log(`[Proxy] Limite righe: cancellate ${result.trimmed} righe vecchie (${table})`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    log(`[Proxy] Errore entrata: ${message}`);
    sendTelegram(scanTelegramText(name, table, 'Entrata', `Errore: ${message}`));
    return `Errore: ${message}`;
  }
  const response = responseText(record);
  log(`[Proxy]: ${response}`);
  sendTelegram(scanTelegramText(name, table, 'Entrata', response));

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
  const time = formatTime(new Date());
  let record: AirtableRecord<PresenzaFields>;
  try {
    // Il proxy rilegge la riga: se nel frattempo è stata chiusa o cancellata (es. dal manager) non scrive.
    const outcome = await setExit<PresenzaFields>(table, latest.id, { Uscita: time, 'GPS Uscita': await gpsText('Uscita') });
    if (outcome.status === 'alreadyClosed') {
      addRecordToHistory(table, outcome.record);
      log('Riga chiusa nel frattempo');
      return { kind: 'alreadyOut' };
    }
    if (outcome.status === 'gone') {
      log('Riga cancellata nel frattempo');
      return { kind: 'noEntry' };
    }
    record = outcome.record;
  } catch (error) {
    log(`Errore dopo aver riconosciuto l'uscita: ${String(error)}`);
    sendTelegram(scanTelegramText(name, table, 'Uscita', `Errore: ${String(error)}`));
    return { kind: 'done', message: SCAN_MESSAGES.connection };
  }
  const response = responseText(record);
  log(`[Proxy]: ${response}`);
  sendTelegram(scanTelegramText(name, table, 'Uscita', response));

  onStatus('Salvataggio dati nel dispositivo..');
  addRecordToHistory(table, record);
  countScanForReview();
  onStatus('Completato');
  return { kind: 'done', message: SCAN_MESSAGES.ok };
}
