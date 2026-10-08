import Storage from 'expo-sqlite/kv-store';

import { log } from '@/lib/log';

// Dati di Airtable ricordati sul telefono per risparmiare chiamate API (SPEC §15.2).

type Entry<T> = { savedAt: number; value: T };

const PREFIX = 'cache:';

function read<T>(key: string): Entry<T> | null {
  try {
    const json = Storage.getItemSync(PREFIX + key);
    return json ? (JSON.parse(json) as Entry<T>) : null;
  } catch {
    return null;
  }
}

export function writeCache<T>(key: string, value: T) {
  Storage.setItemSync(PREFIX + key, JSON.stringify({ savedAt: Date.now(), value }));
}

export function removeCache(key: string) {
  Storage.removeItemSync(PREFIX + key);
}


/**
 * Carica un dato con la cache: se è recente non chiama Airtable; se è vecchio prova a rileggerlo e, se Airtable non
 * risponde, usa quello vecchio. Solo se non c'è nulla in cache si usa `loadWithRetries` (i tentativi della Splash).
 */
export async function loadCached<T>(
  key: string,
  maxAgeMs: number,
  load: () => Promise<T>,
  loadWithRetries: () => Promise<T>
): Promise<T> {
  const entry = read<T>(key);
  if (entry && Date.now() - entry.savedAt < maxAgeMs) return entry.value;
  if (entry) {
    try {
      const value = await load();
      writeCache(key, value);
      return value;
    } catch (error) {
      log(`Uso i dati salvati di "${key}": ${String(error)}`);
      return entry.value;
    }
  }
  const value = await loadWithRetries();
  writeCache(key, value);
  return value;
}
