import Storage from 'expo-sqlite/kv-store';

import { formulaString, listRecords } from '@/lib/airtable';
import { log } from '@/lib/log';
import { availableMonths, hoursOf, isAtWork, recordsOfMonth, type Month, type Presenza, type PresenzaFields } from '@/lib/manager';

// Storico del dipendente in Accesso Dipendenti: le sue presenze lette da Airtable (tabella del suo locale) con UNA
// chiamata, salvate sul telefono. Si rilegge solo se c'è stata una timbratura, se la copia ha più di 30 minuti o se
// il dipendente trascina la lista. Le presenze fatte con l'Intercambio (altre tabelle) non ci sono: SPEC §16.1.

const KEY = 'storicoDipendente';
const MAX_AGE_MS = 30 * 60_000;
const FIELDS: (keyof PresenzaFields)[] = ['Nome', 'Entrata', 'Uscita', 'Created', 'Mese Nome', 'Anno', 'Giorni', 'Giorno Corretto', 'Ore Lavorate'];

export type SavedHistory = {
  table: string;
  name: string;
  /** Momento dell'ultima lettura (ms). */
  fetchedAt: number;
  /** true dopo una timbratura: alla prossima apertura si rilegge. */
  stale: boolean;
  records: Presenza[];
};

/** Copia salvata, solo se è dello stesso dipendente e dello stesso locale. */
export function getSavedHistory(table: string | null, name: string | null): SavedHistory | null {
  if (!table || !name) return null;
  try {
    const json = Storage.getItemSync(KEY);
    if (!json) return null;
    const saved = JSON.parse(json) as SavedHistory;
    return saved.table === table && saved.name === name ? saved : null;
  } catch {
    return null;
  }
}

export function needsRefresh(saved: SavedHistory | null) {
  return !saved || saved.stale || Date.now() - saved.fetchedAt > MAX_AGE_MS;
}

/** Dopo ogni timbratura riuscita: la copia salvata non è più aggiornata (nessuna chiamata qui). */
export function markHistoryStale() {
  try {
    const json = Storage.getItemSync(KEY);
    if (!json) return;
    Storage.setItemSync(KEY, JSON.stringify({ ...(JSON.parse(json) as SavedHistory), stale: true }));
  } catch {
    // copia illeggibile: verrà riletta comunque
  }
}

/** Legge da Airtable tutte le righe del dipendente (nome senza distinguere maiuscole e spazi) e le salva. */
export async function refreshHistory(table: string, name: string): Promise<SavedHistory> {
  log('Accesso Dipendenti: lettura storico da Airtable');
  const records = await listRecords<PresenzaFields>(table, {
    filterByFormula: `LOWER(TRIM({Nome})) = LOWER(TRIM(${formulaString(name)}))`,
    sort: [{ field: 'Created', direction: 'desc' }],
    fields: FIELDS,
  });
  const saved: SavedHistory = { table, name, fetchedAt: Date.now(), stale: false, records };
  Storage.setItemSync(KEY, JSON.stringify(saved));
  log(`Accesso Dipendenti: ${records.length} presenze lette`);
  return saved;
}

// --- Dati per la schermata ---

export type HistoryMonth = Month & { hours: number; records: Presenza[] };

/** Nome del mese come nel campo "Mese Nome" (es. "ottobre") e anno di oggi. */
function currentMonthKey() {
  const now = new Date();
  return `${now.toLocaleDateString('it-IT', { month: 'long' }).toLowerCase()} ${now.getFullYear()}`;
}

/** Mesi con le loro presenze e le ore (calcolate come il Conteggio del manager), dal più recente. */
export function historyMonths(records: Presenza[]): { current: HistoryMonth | null; previous: HistoryMonth[] } {
  const months = availableMonths(records).map((month) => {
    const list = recordsOfMonth(records, month);
    return { ...month, records: list, hours: list.reduce((sum, record) => sum + hoursOf(record), 0) };
  });
  const key = currentMonthKey();
  return {
    current: months.find((month) => month.key === key) ?? null,
    previous: months.filter((month) => month.key !== key),
  };
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
