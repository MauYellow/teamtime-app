import Storage from 'expo-sqlite/kv-store';

import { formulaString, listRecords, type AirtableRecord } from '@/lib/airtable';
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

// "Copia di Airtable": le presenze del dipendente nella tabella del suo locale, così come Airtable le ha restituite,
// salvate sul telefono. È l'UNICA fonte per Home (ultime attività, turni non chiusi, "già un'entrata oggi") e per
// Accesso Dipendenti: il telefono non calcola né mostra orari suoi.
// - Si crea con una lettura (prima apertura di Home o Accesso Dipendenti).
// - A ogni timbratura si aggiunge la riga che Airtable restituisce nella risposta della stessa chiamata: zero chiamate.
// - Si rilegge da capo in Accesso Dipendenti se ha più di 30 minuti, trascinando la lista o toccando l'avviso rosso
//   dei turni non chiusi (correzioni del manager).
// Le presenze fatte con l'Intercambio (altre tabelle) non ci sono: SPEC §16.1.

const KEY = 'storicoDipendente';
const MAX_AGE_MS = 30 * 60_000;
const FIELDS: (keyof PresenzaFields)[] = ['Nome', 'Entrata', 'Uscita', 'Created', 'Mese Nome', 'Anno', 'Giorni', 'Giorno Corretto', 'Ore Lavorate', 'ID'];

/** Dalla più recente: per ID (Created è solo una data, come "2026-10-10"). */
function newestFirst(a: Presenza, b: Presenza) {
  return (b.fields.ID ?? 0) - (a.fields.ID ?? 0);
}

export type SavedHistory = {
  table: string;
  name: string;
  /** Momento dell'ultima lettura completa (ms). */
  fetchedAt: number;
  records: Presenza[];
};

/** Copia salvata, solo se è dello stesso dipendente e dello stesso locale. */
export function getSavedHistory(table: string | null, name: string | null): SavedHistory | null {
  if (!table || !name) return null;
  try {
    const json = Storage.getItemSync(KEY);
    if (!json) return null;
    const saved = JSON.parse(json) as SavedHistory;
    return saved.table === table && saved.name === name && Array.isArray(saved.records) ? saved : null;
  } catch {
    return null;
  }
}

/** Accesso Dipendenti: rilettura se la copia manca o ha più di 30 minuti. */
export function needsRefresh(saved: SavedHistory | null) {
  return !saved || Date.now() - saved.fetchedAt > MAX_AGE_MS;
}

/**
 * Dopo una timbratura riuscita: mette nella copia la riga restituita da Airtable (nuova entrata o uscita aggiornata).
 * Solo se la copia esiste ed è della stessa tabella: una copia con una riga sola sembrerebbe completa, e le timbrature
 * con l'Intercambio vanno in un'altra tabella.
 */
export function addRecordToHistory(table: string, record: AirtableRecord<PresenzaFields>) {
  try {
    const json = Storage.getItemSync(KEY);
    if (!json) return;
    const saved = JSON.parse(json) as SavedHistory;
    if (saved.table !== table) return;
    const records = [record, ...saved.records.filter((item) => item.id !== record.id)];
    records.sort(newestFirst);
    Storage.setItemSync(KEY, JSON.stringify({ ...saved, records }));
  } catch (error) {
    log(`Copia Airtable: riga non aggiunta ${String(error)}`);
  }
}

/** Toglie dalla copia una riga che su Airtable non esiste più (cancellata dal manager). */
export function removeRecordFromHistory(id: string) {
  try {
    const json = Storage.getItemSync(KEY);
    if (!json) return;
    const saved = JSON.parse(json) as SavedHistory;
    Storage.setItemSync(KEY, JSON.stringify({ ...saved, records: saved.records.filter((item) => item.id !== id) }));
  } catch (error) {
    log(`Copia Airtable: riga non tolta ${String(error)}`);
  }
}

/** Legge da Airtable tutte le righe del dipendente (nome senza distinguere maiuscole e spazi) e le salva. */
export async function refreshHistory(table: string, name: string): Promise<SavedHistory> {
  log('Copia Airtable: lettura delle presenze del dipendente');
  const records = await listRecords<PresenzaFields>(table, {
    filterByFormula: `LOWER(TRIM({Nome})) = LOWER(TRIM(${formulaString(name)}))`,
    sort: [{ field: 'ID', direction: 'desc' }],
    fields: FIELDS,
  });
  const saved: SavedHistory = { table, name, fetchedAt: Date.now(), records };
  Storage.setItemSync(KEY, JSON.stringify(saved));
  log(`Copia Airtable: ${records.length} presenze lette`);
  saveMonthlyTotals(table, name, records);
  return saved;
}

// --- Totali dei mesi passati salvati sul telefono ---
// Le righe vecchie spariscono (Max Rows), quindi il totale di un mese passato si salva e si aggiorna SOLO finché il mese
// è sicuramente completo: cioè esiste ancora una presenza del dipendente più vecchia dell'inizio del mese (la
// cancellazione parte dalle righe più vecchie). Quando il mese non è più completo resta l'ultimo totale salvato, che è
// quello definitivo (le righe cancellate non le può più correggere nemmeno il manager). Mai un totale calcolato su un
// mese tagliato: in quel caso "Totale non disponibile".

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

function readTotals(table: string, name: string): Record<string, SavedTotal> {
  try {
    const json = Storage.getItemSync(TOTALS_KEY);
    if (!json) return {};
    const saved = JSON.parse(json) as SavedTotals;
    return saved.table === table && saved.name === name ? saved.months : {};
  } catch {
    return {};
  }
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
  Storage.setItemSync(TOTALS_KEY, JSON.stringify({ table, name, months: Object.fromEntries(kept) }));
}

export type PastMonth = { key: string; label: string; /** null = non si può sapere il totale giusto */ hours: number | null };

/** Mesi passati per Accesso Dipendenti: totali salvati più i mesi ancora nella copia ma non verificabili. */
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

/** "Risulta già un'entrata a tuo nome oggi": dalla copia di Airtable (senza copia: nessun avviso). */
export function historyHasEntryToday(table: string | null, name: string | null) {
  const day = today();
  return getSavedHistory(table, name)?.records.some((record) => localDay(record) === day) ?? false;
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
