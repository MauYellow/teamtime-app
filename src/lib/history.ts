import Storage from 'expo-sqlite/kv-store';

import { formulaString, listRecords, type AirtableRecord } from '@/lib/airtable';
import { readCacheEntry, writeCache } from '@/lib/cache';
import { fetchLocale, isYes, localeCacheKey, type LocaleFields } from '@/lib/locali';
import { log } from '@/lib/log';
import {
  availableMonths,
  hoursOf,
  isAtWork,
  MONTHS,
  recordsOfMonth,
  type Month,
  type Presenza,
  type PresenzaFields,
} from '@/lib/manager';
import { getSession } from '@/lib/session';
import { getActivities, getEmployeeLocale, getEmployeeName } from '@/lib/storage';

// "Copia di Airtable": le presenze del dipendente in una tabella, così come Airtable le ha restituite, salvate sul
// telefono. È l'UNICA fonte per Home (ultime attività, turni non chiusi, "già un'entrata oggi"), Accessi e Gestisci:
// il telefono non calcola né mostra orari suoi.
// - Si crea con una lettura (prima apertura di Home o Accessi).
// - A ogni timbratura si aggiunge la riga che Airtable restituisce nella risposta della stessa chiamata: zero chiamate.
// - Si rilegge da capo se ha più di 30 minuti, trascinando la lista o toccando l'avviso rosso dei turni non chiusi.
// [SPEC §16.1, 15/10/2026] Una copia per ogni azienda: il proprio locale e, con l'Intercambio, ogni tabella in cui il
// telefono ha timbrato con successo (nessuna ricerca nelle altre tabelle).

const KEY = 'storicoDipendente';
const MAX_AGE_MS = 30 * 60_000;
const FIELDS: (keyof PresenzaFields)[] = ['Nome', 'Entrata', 'Uscita', 'Created', 'Mese Nome', 'Anno', 'Giorni', 'Giorno Corretto', 'Ore Lavorate', 'ID'];

/** Dalla più recente: per ID (Created è solo una data, come "2026-10-10"). Vale dentro una sola tabella. */
function newestFirst(a: Presenza, b: Presenza) {
  return (b.fields.ID ?? 0) - (a.fields.ID ?? 0);
}

export type SavedHistory = {
  table: string;
  name: string;
  /** Momento dell'ultima lettura completa (ms); 0 = copia incompleta (solo le righe delle timbrature), da rileggere. */
  fetchedAt: number;
  records: Presenza[];
};

function historyKey(table: string) {
  return `${KEY}:${table}`;
}

function readJson<T>(key: string): T | null {
  try {
    const json = Storage.getItemSync(key);
    return json ? (JSON.parse(json) as T) : null;
  } catch {
    return null;
  }
}

/**
 * Copia salvata di una tabella, solo se è dello stesso dipendente. La copia unica delle versioni precedenti
 * (chiave "storicoDipendente") passa alla chiave della sua tabella alla prima lettura.
 */
export function getSavedHistory(table: string | null, name: string | null): SavedHistory | null {
  if (!table || !name) return null;
  let saved = readJson<SavedHistory>(historyKey(table));
  if (!saved) {
    const legacy = readJson<SavedHistory>(KEY);
    if (legacy?.table === table) {
      Storage.setItemSync(historyKey(table), JSON.stringify(legacy));
      Storage.removeItemSync(KEY);
      saved = legacy;
    }
  }
  return saved && saved.table === table && saved.name === name && Array.isArray(saved.records) ? saved : null;
}

/** Rilettura se la copia manca, è incompleta o ha più di 30 minuti. */
export function needsRefresh(saved: SavedHistory | null) {
  return !saved || saved.fetchedAt === 0 || Date.now() - saved.fetchedAt > MAX_AGE_MS;
}

/**
 * Dopo una timbratura riuscita: mette nella copia della tabella la riga restituita da Airtable (nuova entrata o uscita
 * aggiornata) e ricorda la tabella tra le aziende del dipendente. Se la copia non c'è ancora (prima timbratura in
 * un'azienda) se ne crea una incompleta, che si rilegge alla prossima occasione.
 */
export function addRecordToHistory(table: string, record: AirtableRecord<PresenzaFields>) {
  try {
    const name = getEmployeeName();
    if (!name) return;
    rememberTable(table, name);
    const saved = getSavedHistory(table, name) ?? { table, name, fetchedAt: 0, records: [] };
    const records = [record, ...saved.records.filter((item) => item.id !== record.id)];
    records.sort(newestFirst);
    Storage.setItemSync(historyKey(table), JSON.stringify({ ...saved, records }));
  } catch (error) {
    log(`Copia Airtable: riga non aggiunta ${String(error)}`);
  }
}

/** Toglie da una copia una riga che su Airtable non esiste più (cancellata dal manager). */
export function removeRecordFromHistory(table: string, id: string) {
  try {
    const saved = getSavedHistory(table, getEmployeeName());
    if (!saved) return;
    const records = saved.records.filter((item) => item.id !== id);
    Storage.setItemSync(historyKey(table), JSON.stringify({ ...saved, records }));
  } catch (error) {
    log(`Copia Airtable: riga non tolta ${String(error)}`);
  }
}

/** Legge da Airtable tutte le righe del dipendente in una tabella (nome senza maiuscole e spazi) e le salva. */
export async function refreshHistory(table: string, name: string): Promise<SavedHistory> {
  log(`Copia Airtable: lettura delle presenze del dipendente (${table})`);
  const records = await listRecords<PresenzaFields>(table, {
    filterByFormula: `LOWER(TRIM({Nome})) = LOWER(TRIM(${formulaString(name)}))`,
    sort: [{ field: 'ID', direction: 'desc' }],
    fields: FIELDS,
  });
  const saved: SavedHistory = { table, name, fetchedAt: Date.now(), records };
  Storage.setItemSync(historyKey(table), JSON.stringify(saved));
  log(`Copia Airtable: ${records.length} presenze lette (${table})`);
  saveMonthlyTotals(table, name, records);
  return saved;
}

// --- Aziende del dipendente (Intercambio, SPEC §16.1) ---
// Le tabelle in cui il telefono ha timbrato con successo, oltre al proprio locale. Si parte anche dalle "ultime
// attività" migrate dalla vecchia app (il testo inizia con il locale). Una scheda compare solo se nella copia ci sono
// righe del dipendente: le tabelle teamtime0XX possono essere riassegnate a clienti nuovi.

const TABLES_KEY = 'aziendeTimbrate';
/** Nome e impostazioni delle altre aziende si rileggono al massimo una volta al giorno. */
const COMPANY_MAX_AGE_MS = 24 * 60 * 60_000;

type RememberedTables = { name: string; tables: string[]; seeded?: boolean };

function readRemembered(name: string): RememberedTables {
  const saved = readJson<RememberedTables>(TABLES_KEY);
  return saved?.name === name && Array.isArray(saved.tables) ? saved : { name, tables: [] };
}

function writeRemembered(value: RememberedTables) {
  Storage.setItemSync(TABLES_KEY, JSON.stringify(value));
}

function rememberTable(table: string, name: string) {
  const saved = readRemembered(name);
  if (!saved.tables.includes(table)) writeRemembered({ ...saved, tables: [...saved.tables, table] });
}

function forgetTable(table: string, name: string) {
  const saved = readRemembered(name);
  writeRemembered({ ...saved, tables: saved.tables.filter((item) => item !== table) });
  Storage.removeItemSync(historyKey(table));
}

/** Tabelle ricordate, con quelle delle attività migrate da Thunkable aggiunte una volta sola. */
function rememberedTables(name: string) {
  const saved = readRemembered(name);
  if (saved.seeded) return saved.tables;
  const fromThunkable = getActivities()
    .map((activity) => activity.locale.trim())
    // Nome di una tabella: senza spazi (es. teamtime038). Gli altri testi non si possono verificare.
    .filter((table) => /^[A-Za-z0-9_-]+$/.test(table));
  const tables = [...new Set([...saved.tables, ...fromThunkable])];
  writeRemembered({ name, tables, seeded: true });
  return tables;
}

/**
 * Tabelle da mostrare: il proprio locale sempre; con l'Intercambio anche le altre aziende ricordate, se la copia ha
 * righe del dipendente o non è ancora stata letta.
 */
export function employeeTables(own: string | null, name: string | null, intercambio: boolean): string[] {
  if (!own || !name) return [];
  if (!intercambio) return [own];
  const others = rememberedTables(name).filter((table) => {
    if (table === own) return false;
    const saved = getSavedHistory(table, name);
    return !saved || saved.records.length > 0;
  });
  return [own, ...others];
}

/** Intercambio attivo per il locale del dipendente (letto alla Splash). */
export function intercambioActive() {
  return isYes(getSession().locale?.Intercambio);
}

/**
 * Aziende da mostrare adesso: il proprio locale e le altre con almeno una riga del dipendente nella copia (quelle
 * ricordate ma non ancora lette compaiono dopo la lettura).
 */
export function myCompanies() {
  const name = getEmployeeName();
  return employeeTables(getEmployeeLocale(), name, intercambioActive()).filter(
    (table, index) => index === 0 || (getSavedHistory(table, name)?.records.length ?? 0) > 0
  );
}

/** True se almeno una copia da leggere manca o è incompleta (anche delle aziende non ancora lette). */
export function hasMissingCopies() {
  const name = getEmployeeName();
  return employeeTables(getEmployeeLocale(), name, intercambioActive()).some((table) =>
    shouldRefresh(getSavedHistory(table, name), 'missing')
  );
}

/** Momento della lettura più vecchia tra le copie (per "Aggiornato alle…"), o null se ne manca una. */
export function oldestFetch(tables: string[], name: string | null) {
  let oldest: number | null = null;
  for (const table of tables) {
    const saved = getSavedHistory(table, name);
    if (!saved) return null;
    if (saved.fetchedAt > 0 && (oldest === null || saved.fetchedAt < oldest)) oldest = saved.fetchedAt;
  }
  return oldest;
}

/** Dati pubblici di un'azienda (Locali Approvati) salvati sul telefono: nome della scheda e impostazioni. */
export function companyInfo(table: string): LocaleFields | null {
  return readCacheEntry<LocaleFields | null>(localeCacheKey(table))?.value ?? null;
}

/** Nome della scheda: Nome del locale in Locali Approvati, altrimenti il nome della tabella. */
export function companyName(table: string) {
  return companyInfo(table)?.Nome?.trim() || table;
}

/**
 * Quali copie rileggere: "missing" = mancanti o incomplete (Home), "stale" = anche quelle con più di 30 minuti (Accessi,
 * Gestisci), "all" = tutte (aggiornamento a mano).
 */
export type RefreshMode = 'missing' | 'stale' | 'all';

function shouldRefresh(saved: SavedHistory | null, mode: RefreshMode) {
  if (mode === 'all') return true;
  if (mode === 'missing') return !saved || saved.fetchedAt === 0;
  return needsRefresh(saved);
}

/**
 * Rilegge le copie che servono, una tabella dopo l'altra (mai tutte insieme: Airtable accetta 5 chiamate al secondo
 * per tutta la base), secondo `mode`. Per le altre aziende
 * rilegge anche nome e impostazioni (al massimo una volta al giorno); un'azienda che non è più in Locali Approvati si
 * dimentica. Errore solo se non si è riusciti a leggere nulla di ciò che serviva.
 */
export async function refreshEmployeeTables(own: string, name: string, intercambio: boolean, mode: RefreshMode) {
  let attempts = 0;
  let failures = 0;
  for (const table of employeeTables(own, name, intercambio)) {
    const saved = getSavedHistory(table, name);
    if (!shouldRefresh(saved, mode)) continue;
    attempts++;
    try {
      if (table !== own) {
        const info = readCacheEntry<LocaleFields | null>(localeCacheKey(table));
        if (!info?.value || Date.now() - info.savedAt > COMPANY_MAX_AGE_MS) {
          const locale = await fetchLocale(table);
          if (!locale) {
            log(`Intercambio: ${table} non è in Locali Approvati, scheda tolta`);
            forgetTable(table, name);
            continue;
          }
          writeCache(localeCacheKey(table), locale);
        }
      }
      await refreshHistory(table, name);
    } catch (error) {
      failures++;
      log(`Copia Airtable: ${table} non letta ${String(error)}`);
    }
  }
  if (attempts > 0 && failures === attempts) throw new Error('Copie Airtable non lette');
}

// --- Tutte le aziende insieme ---

/** Presenza con l'azienda (tabella) a cui appartiene. */
export type CompanyPresenza = { table: string; record: Presenza };

function minutesOfEntry(record: Presenza) {
  const match = /^(\d{1,2})[:.](\d{2})/.exec(record.fields.Entrata?.trim() ?? '');
  return match ? Number(match[1]) * 60 + Number(match[2]) : 0;
}

/**
 * Righe di più tabelle, dalla più recente: per giorno del turno e ora di entrata (l'ID è un contatore diverso per ogni
 * tabella; le righe aggiunte dal manager hanno il createdTime dell'inserimento), a parità per createdTime.
 */
export function mergedRecords(tables: string[], name: string | null): CompanyPresenza[] {
  const list: CompanyPresenza[] = [];
  for (const table of tables) {
    for (const record of getSavedHistory(table, name)?.records ?? []) list.push({ table, record });
  }
  return list.sort((a, b) => {
    const day = localDay(b.record).localeCompare(localDay(a.record));
    if (day !== 0) return day;
    const time = minutesOfEntry(b.record) - minutesOfEntry(a.record);
    return time !== 0 ? time : b.record.createdTime.localeCompare(a.record.createdTime);
  });
}

/** "Risulta già un'entrata a tuo nome oggi": in quale azienda (dalle copie), o null. */
export function entryTodayIn(tables: string[], name: string | null) {
  const day = today();
  return mergedRecords(tables, name).find((item) => localDay(item.record) === day)?.table ?? null;
}

/** Turno di oggi ancora "al lavoro" in un'azienda diversa da `except` (dalle copie), o null. */
export function openShiftTodayElsewhere(tables: string[], name: string | null, except: string) {
  const day = today();
  return (
    mergedRecords(tables, name).find(
      (item) => item.table !== except && isAtWork(item.record) && localDay(item.record) === day
    ) ?? null
  );
}

/** Turno ancora "al lavoro" (di oggi o dei giorni prima) in un'azienda diversa da `except`, o null. */
export function openShiftElsewhere(tables: string[], name: string | null, except: string) {
  return mergedRecords(tables, name).find((item) => item.table !== except && isAtWork(item.record)) ?? null;
}

// --- Totali dei mesi passati salvati sul telefono ---
// Le righe vecchie spariscono (Max Rows), quindi il totale di un mese passato si salva e si aggiorna SOLO finché il mese
// è sicuramente completo: cioè esiste ancora una presenza del dipendente più vecchia dell'inizio del mese (la
// cancellazione parte dalle righe più vecchie). Quando il mese non è più completo resta l'ultimo totale salvato, che è
// quello definitivo (le righe cancellate non le può più correggere nemmeno il manager). Mai un totale calcolato su un
// mese tagliato: in quel caso "Totale non disponibile". Un blocco di totali per ogni azienda (Max Rows vale per tabella).

const TOTALS_KEY = 'totaliMensili';
/** Mesi passati tenuti sul telefono. */
const TOTALS_KEEP = 12;

type SavedTotal = { label: string; hours: number; order: number };
type SavedTotals = { table: string; name: string; months: Record<string, SavedTotal> };

function monthOrder(month: Month) {
  return Number(month.year || 0) * 100 + MONTHS.indexOf(month.month);
}

/** "2026-09-01" */
function monthStart(month: Month) {
  return `${month.year}-${String(MONTHS.indexOf(month.month) + 1).padStart(2, '0')}-01`;
}

function totalsKey(table: string) {
  return `${TOTALS_KEY}:${table}`;
}

/** Totali salvati di una tabella. Quelli unici delle versioni precedenti passano alla chiave della loro tabella. */
function readTotals(table: string, name: string): Record<string, SavedTotal> {
  let saved = readJson<SavedTotals>(totalsKey(table));
  if (!saved) {
    const legacy = readJson<SavedTotals>(TOTALS_KEY);
    if (legacy?.table === table) {
      Storage.setItemSync(totalsKey(table), JSON.stringify(legacy));
      Storage.removeItemSync(TOTALS_KEY);
      saved = legacy;
    }
  }
  return saved?.table === table && saved.name === name && saved.months ? saved.months : {};
}

function saveMonthlyTotals(table: string, name: string, records: Presenza[]) {
  if (records.length === 0) return;
  const oldestDay = records.map(localDay).sort()[0];
  const current = currentMonthKey();
  const months = { ...readTotals(table, name) };
  for (const month of monthsWithHours(records)) {
    if (month.key === current || MONTHS.indexOf(month.month) < 0) continue;
    if (oldestDay < monthStart(month)) {
      months[month.key] = { label: month.label, hours: month.hours, order: monthOrder(month) };
    }
  }
  const kept = Object.entries(months)
    .sort(([, a], [, b]) => b.order - a.order)
    .slice(0, TOTALS_KEEP);
  Storage.setItemSync(totalsKey(table), JSON.stringify({ table, name, months: Object.fromEntries(kept) }));
}

export type PastMonth = { key: string; label: string; /** null = non si può sapere il totale giusto */ hours: number | null };

/** Mesi passati di un'azienda per Accessi: totali salvati più i mesi ancora nella copia ma non verificabili. */
export function pastMonths(table: string | null, name: string | null, records: Presenza[]): PastMonth[] {
  if (!table || !name) return [];
  const saved = readTotals(table, name);
  const current = currentMonthKey();
  const list = new Map<string, PastMonth & { order: number }>();
  for (const month of availableMonths(records)) {
    if (month.key === current) continue;
    list.set(month.key, { key: month.key, label: month.label, hours: null, order: monthOrder(month) });
  }
  for (const [key, total] of Object.entries(saved)) {
    if (key !== current) list.set(key, { key, label: total.label, hours: total.hours, order: total.order });
  }
  return [...list.values()].sort((a, b) => b.order - a.order).slice(0, TOTALS_KEEP);
}

/** Mese passato di tutte le aziende insieme, con il dettaglio per azienda. */
export type PastMonthAll = PastMonth & { parts: { table: string; hours: number | null }[] };

/**
 * Mesi passati di "Tutte": per ogni mese la somma delle aziende in cui ci sono ore. Se il totale di una di queste non è
 * disponibile, non lo è nemmeno la somma (mai un totale tagliato).
 */
export function pastMonthsAll(tables: string[], name: string | null): PastMonthAll[] {
  const months = new Map<string, PastMonthAll & { order: number }>();
  for (const table of tables) {
    const records = getSavedHistory(table, name)?.records ?? [];
    for (const month of pastMonths(table, name, records)) {
      const entry = months.get(month.key) ?? { key: month.key, label: month.label, hours: 0, parts: [], order: 0 };
      entry.parts.push({ table, hours: month.hours });
      entry.hours = entry.hours === null || month.hours === null ? null : entry.hours + month.hours;
      const [monthName, year] = month.key.split(' ');
      entry.order = Number(year || 0) * 100 + MONTHS.indexOf(monthName);
      months.set(month.key, entry);
    }
  }
  return [...months.values()].sort((a, b) => b.order - a.order).slice(0, TOTALS_KEEP);
}

function createdOf(record: Presenza) {
  return record.fields.Created ?? record.createdTime;
}

/** Data locale (AAAA-MM-GG) della presenza. */
export function localDay(record: Presenza) {
  const created = createdOf(record);
  if (created.length === 10) return created;
  const date = new Date(created);
  if (Number.isNaN(date.getTime())) return created.slice(0, 10);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

export function today() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

/** Turni lasciati "al lavoro" nei giorni prima di oggi (il turno aperto di oggi è normale). */
export function openPastShifts(records: Presenza[]) {
  const day = today();
  return records.filter((record) => isAtWork(record) && localDay(record) < day);
}

// --- Dati per la schermata ---

export type HistoryMonth = Month & { hours: number; records: Presenza[] };

/** Nome del mese come nel campo "Mese Nome" (es. "ottobre") e anno di oggi. */
function currentMonthKey() {
  const now = new Date();
  return `${now.toLocaleDateString('it-IT', { month: 'long' }).toLowerCase()} ${now.getFullYear()}`;
}

/** Mesi con le loro presenze e le ore (calcolate come il Conteggio del manager), dal più recente. */
function monthsWithHours(records: Presenza[]): HistoryMonth[] {
  return availableMonths(records).map((month) => {
    const list = recordsOfMonth(records, month);
    return { ...month, records: list, hours: list.reduce((sum, record) => sum + hoursOf(record), 0) };
  });
}

/** Il mese in corso, con presenze e ore (null se questo mese non ci sono presenze). */
export function currentMonth(records: Presenza[]): HistoryMonth | null {
  const key = currentMonthKey();
  return monthsWithHours(records).find((month) => month.key === key) ?? null;
}

/** Presenze del mese in corso tra quelle di più aziende (stesso ordine). */
export function currentMonthOf(list: CompanyPresenza[]) {
  const key = currentMonthKey();
  return list.filter((item) => {
    const month = item.record.fields['Mese Nome']?.trim().toLowerCase();
    return month && `${month} ${String(item.record.fields.Anno ?? '').trim()}` === key;
  });
}

/** "8,50" */
export function formatEmployeeHours(hours: number) {
  return hours.toFixed(2).replace('.', ',');
}

/** "Ven 10/10" (con Giorno Corretto, se il manager l'ha impostato, vale quel giorno). */
export function dayLabel(record: Presenza) {
  const created = record.fields.Created ?? record.createdTime;
  const date = new Date(created.length === 10 ? `${created}T12:00:00` : created);
  if (Number.isNaN(date.getTime())) return created;
  const corrected = Number(record.fields['Giorno Corretto']);
  if (corrected >= 1 && corrected <= 31) return `${corrected}/${date.getMonth() + 1}`;
  const weekday = date.toLocaleDateString('it-IT', { weekday: 'short' }).replace('.', '');
  return `${weekday.charAt(0).toUpperCase()}${weekday.slice(1)} ${date.getDate()}/${date.getMonth() + 1}`;
}

/** "9:00 → 17:30 · 8,50 ore" oppure "9:00 → al lavoro". */
export function presenzaLabel(record: Presenza) {
  const entry = record.fields.Entrata ?? '—';
  if (isAtWork(record)) return `${entry} → al lavoro`;
  return `${entry} → ${record.fields.Uscita ?? '—'} · ${formatEmployeeHours(hoursOf(record))} ore`;
}
