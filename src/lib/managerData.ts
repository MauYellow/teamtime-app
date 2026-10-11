import { useSyncExternalStore } from 'react';

import { log } from '@/lib/log';
import { fetchAllPresenze, type Presenza } from '@/lib/manager';

// Presenze del locale per l'area manager, lette UNA volta all'ingresso (tutte: al massimo Max Rows righe, circa 4
// chiamate) e tenute in memoria: Calendario e Conteggio usano gli stessi dati, sempre allineati. Si rileggono con
// l'icona di aggiornamento; una correzione da Correggi Orari aggiorna la riga in memoria senza rileggere.

export type ManagerData = {
  table: string | null;
  records: Presenza[] | null;
  fetchedAt: Date | null;
  loading: boolean;
  failed: boolean;
};

let state: ManagerData = { table: null, records: null, fetchedAt: null, loading: false, failed: false };
const listeners = new Set<() => void>();

function set(patch: Partial<ManagerData>) {
  state = { ...state, ...patch };
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useManagerData() {
  return useSyncExternalStore(subscribe, () => state);
}

/** Legge tutte le presenze del locale. Senza force non rilegge se sono già in memoria per lo stesso locale. */
export async function loadManagerData(table: string, force = false) {
  if (state.loading) return;
  if (!force && state.table === table && state.records) return;
  set({ table, loading: true, failed: false, ...(state.table !== table ? { records: null, fetchedAt: null } : {}) });
  try {
    const records = await fetchAllPresenze(table);
    set({ records, fetchedAt: new Date(), loading: false });
    log(`Area manager: ${records.length} presenze lette`);
  } catch (error) {
    log(`Area manager: errore lettura presenze ${String(error)}`);
    set({ loading: false, failed: true });
  }
}

/** Dopo una modifica (es. uscita impostata in Correggi Orari): aggiorna la riga in memoria. */
export function updateManagerRecord(record: Presenza) {
  if (!state.records) return;
  set({ records: state.records.map((item) => (item.id === record.id ? record : item)) });
}

/** All'uscita dall'area manager. */
export function clearManagerData() {
  set({ table: null, records: null, fetchedAt: null, loading: false, failed: false });
}
