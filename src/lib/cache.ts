import Storage from 'expo-sqlite/kv-store';

import { log } from '@/lib/log';

// Copie sul telefono dei dati letti all'avvio, usate quando la rete o Airtable non rispondono.

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
 * Rilegge un dato a ogni apertura e ne salva una copia sul telefono: se la lettura fallisce si usa l'ultima copia
 * salvata. Solo se non c'è nessuna copia si usa `loadFirstTime` (es. i tentativi ripetuti della Splash).
 */
export async function loadCached<T>(
  key: string,
  load: () => Promise<T>,
  loadFirstTime: () => Promise<T>
): Promise<T> {
  const entry = read<T>(key);
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
  const value = await loadFirstTime();
  writeCache(key, value);
  return value;
}
