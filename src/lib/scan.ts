import { formatTime } from '@/lib/activities';
import { createEntry, exitLatest, type AirtableRecord } from '@/lib/airtable';
import { writeCache } from '@/lib/cache';
import { DEVICE } from '@/lib/device';
import { ApiError } from '@/lib/api';
import { addRecordToHistory, companyInfo, localDay, today } from '@/lib/history';
import { fetchLocale, isYes, localeCacheKey, type LocaleFields } from '@/lib/locali';
import { getCurrentAddress, requestLocationPermission } from '@/lib/location';
import { localePreferences } from '@/lib/preferences';
import { log } from '@/lib/log';
import { countScanForReview } from '@/lib/review';
import { getSession } from '@/lib/session';
import { clearLastScanError, getEmployeeName, getLastScanError, saveLastScanError, type ScanError } from '@/lib/storage';
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

export type ExitResult =
  | { kind: 'done'; message: string }
  /** `exitToday`: orario dell'uscita se l'ultima riga è di oggi (uscita salvata ma risposta persa, §15.6 punto 9). */
  | { kind: 'alreadyOut'; exitToday?: string }
  | { kind: 'noEntry' }
  /** Turno aperto da più della durata massima: non si chiude con questa uscita (§15.6 punto 3). */
  | { kind: 'tooOld'; record: AirtableRecord<PresenzaFields> };

/** Dopo un'entrata non riuscita, entro questo tempo si chiede al proxy di controllare il doppione (§15.6 punto 2). */
const RECENT_FAILURE_MS = 15 * 60_000;

/** Timbratura riuscita (anche "entrata già registrata"): il messaggio contiene "correttamente", come Scan Result. */
export function isScanSuccess(message: string) {
  return message.includes('correttamente');
}

/**
 * Messaggio comprensibile per il dipendente ("Scan non riuscito: motivo. Riprova"). Il messaggio tecnico resta nel log
 * e nel report per lo sviluppatore.
 */
export function friendlyScanMessage(message: string) {
  if (isScanSuccess(message) || message === SCAN_MESSAGES.entryCancelled) return message;
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
  if (isScanSuccess(message)) {
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
  if (other) {
    log(`Intercambio: ${scanned} riconosciuto`);
    // Salvato per il GPS di quell'azienda e per nome e impostazioni della sua scheda (SPEC §16.1).
    writeCache(localeCacheKey(scanned), other);
  }
  return !!other;
}

/** Dati dell'azienda del QR scansionato: il proprio locale dalla Splash, le altre salvate (o lette, 1 chiamata). */
async function scannedLocale(table: string): Promise<LocaleFields | null> {
  const own = getSession().locale;
  if (!own || own.Locale === table) return own;
  const saved = companyInfo(table);
  if (saved) return saved;
  try {
    const locale = await fetchLocale(table);
    if (locale) writeCache(localeCacheKey(table), locale);
    return locale;
  } catch (error) {
    log(`GPS: dati di ${table} non letti ${String(error)}`);
    return null;
  }
}

/**
 * Testo del campo GPS / GPS Uscita: indirizzo attuale se l'azienda del QR scansionato ha GPS = yes. [15/10/2026] Con
 * l'Intercambio vale l'impostazione di quell'azienda, non quella del locale del dipendente (prima: sempre la propria).
 */
async function gpsText(table: string, kind: 'Entrata' | 'Uscita') {
  const locale = await scannedLocale(table);
  if (!isYes(locale?.GPS)) {
    return kind === 'Entrata' ? 'Estensione GPS non attiva' : "Funzione GPS non disponibile per l'utente";
  }
  // Il permesso si chiede alla Splash solo se il proprio locale ha il GPS: per un'altra azienda si chiede qui.
  if (locale?.Locale !== getSession().locale?.Locale) await requestLocationPermission();
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
  // Entrata non riuscita da poco: forse era stata scritta comunque (risposta persa). Il proxy controlla prima.
  const lastError = getLastScanError();
  const checkRecent =
    lastError?.type === 'Entrata' && Date.now() - new Date(lastError.at).getTime() < RECENT_FAILURE_MS;
  try {
    const gps = await gpsText(table, 'Entrata');
    const result = await createEntry<PresenzaFields>(table, { Nome: name, Entrata: time, Device: DEVICE, GPS: gps }, checkRecent);
    record = result.record;
    if (result.duplicate) {
      log(`[Proxy] Entrata già registrata alle ${record.fields.Entrata}: nessuna riga nuova`);
      addRecordToHistory(table, record);
      return `La tua entrata delle ${record.fields.Entrata ?? '—'} risulta già registrata correttamente.`;
    }
    if (result.trimmed > 0) log(`[Proxy] Limite righe: cancellate ${result.trimmed} righe vecchie (${table})`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    log(`[Proxy] Errore entrata: ${message}`);
    sendTelegram(scanTelegramText(name, table, 'Entrata', `Errore: ${message}`));
    // Nessuna risposta (rete assente o lenta): messaggio di connessione (§15.6 punto 7).
    if (error instanceof ApiError && error.status === 0) return SCAN_MESSAGES.connection;
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
 * [15/10/2026] In un solo passaggio dal proxy (ricerca della riga + uscita): 2 chiamate ad Airtable invece di 3.
 * [miglioria] nome confrontato in modo esatto, senza maiuscole e spazi (l'originale usava FIND, che trovava anche
 * "Mario Rossini" cercando "Mario Rossi"); "Al lavoro" senza distinguere maiuscole (il portale scrive "Al Lavoro").
 */
export async function registerExit(table: string, onStatus: ScanStatus): Promise<ExitResult> {
  const name = getEmployeeName() ?? '';
  onStatus('Ricerca della tua entrata..');
  log('[Proxy] Scan di uscita: ricerca della riga e scrittura');

  const time = formatTime(new Date());
  let record: AirtableRecord<PresenzaFields>;
  try {
    const locale = await scannedLocale(table);
    const gps = await gpsText(table, 'Uscita');
    onStatus('Aggiornamento del database..');
    const maxHours = localePreferences(locale).oreMaxTurno;
    const outcome = await exitLatest<PresenzaFields>(table, name, { Uscita: time, 'GPS Uscita': gps }, maxHours);
    if (outcome.status === 'noEntry') {
      // Il bottone Uscita è sempre attivo: chi non ha nessuna riga su questa tabella riceve un avviso suo.
      log('Nessuna entrata del dipendente su questa tabella');
      return { kind: 'noEntry' };
    }
    if (outcome.status === 'alreadyClosed') {
      addRecordToHistory(table, outcome.record);
      log('Ultima riga del dipendente già con uscita');
      const sameDay = localDay(outcome.record) === today();
      return { kind: 'alreadyOut', exitToday: sameDay ? outcome.record.fields.Uscita : undefined };
    }
    if (outcome.status === 'tooOld') {
      addRecordToHistory(table, outcome.record);
      log(`Turno aperto da più di ${maxHours} ore: uscita non scritta`);
      return { kind: 'tooOld', record: outcome.record };
    }
    record = outcome.record;
  } catch (error) {
    log(`Errore scan di uscita: ${String(error)}`);
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
