import { Directory, File, Paths } from 'expo-file-system';
import * as SQLite from 'expo-sqlite';
import Storage from 'expo-sqlite/kv-store';
import { Platform } from 'react-native';

import { parseLegacyActivity } from '@/lib/activities';
import { log } from '@/lib/log';
import { getActivities, saveActivities, saveManagerCredentials, setIfEmpty } from '@/lib/storage';

// Migrazione una tantum dei dati salvati dalla vecchia app Thunkable (Local Storage), stesso metodo di Food Cost.
// I dati vecchi vengono solo letti, mai modificati o cancellati.
// - Android: database AsyncStorage (<app>/databases/AsyncStorage, tabella Storage(key, value)).
// - iOS: cartelle "RCTAsyncLocalStorage*" (manifest.json + un file per i valori lunghi).
// DA VERIFICARE su un telefono con la vecchia app: come Thunkable scrive le chiavi (nome esatto o con prefisso)
// e i valori (testo semplice o JSON). Per questo le chiavi si cercano anche "per suffisso" e i valori si
// interpretano in entrambi i modi.

const DONE_KEY = 'migration:thunkable:done';
/** Su iOS, se non si trova nulla, si segna solo la ricerca: una versione futura può cambiare il numero e riprovare. */
const IOS_SEARCHED_KEY = 'migration:thunkable:ios-searched:1';

/** Chiavi del Local Storage di Thunkable (dai blocchi). */
const LEGACY = {
  name: 'Nome',
  locale: 'Locale',
  activities: 'ListaDipendenteOrari',
  firstAccess: 'PrimoAccesso',
  managerLocale: 'Accesso_Locale',
  managerPassword: 'Accesso_Password',
} as const;

type LegacyStore = Map<string, string>;

/** Valore di una chiave: nome esatto, oppure chiave che termina con il nome (es. un prefisso di Thunkable). */
function lookup(store: LegacyStore, key: string): string | null {
  if (store.has(key)) return store.get(key) ?? null;
  for (const [storedKey, value] of store) {
    if (new RegExp(`[^A-Za-z0-9_]${key}$`).test(storedKey)) return value;
  }
  return null;
}

/** Interpreta un valore salvato: JSON (stringa, numero, lista) o testo semplice. */
function decode(value: string | null): unknown {
  if (value === null) return null;
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}

function decodeText(value: string | null) {
  const decoded = decode(value);
  if (decoded === null || decoded === undefined) return null;
  const text = String(decoded).trim();
  return text.length === 0 || text === 'null' ? null : text;
}

export async function migrateThunkableData() {
  if (Platform.OS !== 'android' && Platform.OS !== 'ios') return;
  if (Storage.getItemSync(DONE_KEY) === '1') return;
  if (Platform.OS === 'ios' && Storage.getItemSync(IOS_SEARCHED_KEY) === '1') return;

  let store: LegacyStore;
  try {
    store = Platform.OS === 'android' ? await readAndroidStore() : await readIosStore();
  } catch (error) {
    // Un errore non deve bloccare l'app: si riproverà al prossimo avvio.
    log(`Migrazione Thunkable non riuscita: ${String(error)}`);
    return;
  }

  if (store.size === 0) {
    log('Migrazione Thunkable: nessun dato della vecchia app');
    Storage.setItemSync(Platform.OS === 'ios' ? IOS_SEARCHED_KEY : DONE_KEY, '1');
    return;
  }
  log(`Migrazione Thunkable: chiavi trovate ${[...store.keys()].join(', ')}`);

  const name = decodeText(lookup(store, LEGACY.name));
  const locale = decodeText(lookup(store, LEGACY.locale));
  if (name) setIfEmpty('name', name);
  if (locale) setIfEmpty('locale', locale);

  const firstAccess = decodeText(lookup(store, LEGACY.firstAccess));
  if (firstAccess === 'false') setIfEmpty('firstAccess', 'false');


  const legacyList = decode(lookup(store, LEGACY.activities));
  if (Array.isArray(legacyList) && getActivities().length === 0) {
    saveActivities(
      legacyList
        .filter((item) => typeof item === 'string' && item.trim() && !/nessuna attivit/i.test(item))
        .map(parseLegacyActivity)
    );
  }

  const managerLocale = decodeText(lookup(store, LEGACY.managerLocale));
  const managerPassword = decodeText(lookup(store, LEGACY.managerPassword));
  if (managerLocale && managerPassword) await saveManagerCredentials(managerLocale, managerPassword);

  log(`Migrazione Thunkable completata: nome ${name ? 'sì' : 'no'}, locale ${locale ?? 'no'}`);
  Storage.setItemSync(DONE_KEY, '1');
}

/** Cartella "databases" dell'app Android, accanto a files/SQLite di expo-sqlite. */
function legacyDatabaseDirectory() {
  const base = String(SQLite.defaultDatabaseDirectory ?? '');
  return base.match(/\/files\/SQLite\/?$/) ? base.replace(/\/files\/SQLite\/?$/, '/databases') : null;
}

async function readAndroidStore(): Promise<LegacyStore> {
  const store: LegacyStore = new Map();
  const directory = legacyDatabaseDirectory();
  if (directory === null || !new File(`file://${directory}/AsyncStorage`).exists) return store;

  const legacy = await SQLite.openDatabaseAsync('AsyncStorage', { useNewConnection: true }, directory);
  try {
    const hasTable = await legacy.getFirstAsync<{ name: string }>(
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'Storage'"
    );
    if (!hasTable) return store;
    const rows = await legacy.getAllAsync<{ key: string; value: string | null }>('SELECT key, value FROM Storage');
    for (const row of rows) if (row.value !== null) store.set(row.key, row.value);
  } finally {
    await legacy.closeAsync();
  }
  return store;
}

/** Cartelle dell'AsyncStorage di React Native (es. Library/Application Support/<bundle>/RCTAsyncLocalStorage_V1). */
function findAsyncStorageDirectories(directory: Directory, depth: number, found: Directory[]) {
  let items: (Directory | File)[] = [];
  try {
    items = directory.list();
  } catch {
    return;
  }
  for (const item of items) {
    if (!(item instanceof Directory)) continue;
    if (item.name.startsWith('RCTAsyncLocalStorage')) found.push(item);
    else if (depth > 0) findAsyncStorageDirectories(item, depth - 1, found);
  }
}

async function readIosStore(): Promise<LegacyStore> {
  const store: LegacyStore = new Map();
  const found: Directory[] = [];
  const roots = [Paths.document, new Directory(Paths.document.parentDirectory, 'Library')];
  for (const root of roots) if (root.exists) findAsyncStorageDirectories(root, 3, found);

  for (const directory of found) {
    const manifestFile = new File(directory, 'manifest.json');
    if (!manifestFile.exists) continue;
    // manifest.json: { chiave: valore } per i valori corti; null se il valore sta in un file a parte (nome = md5 della chiave).
    const manifest = JSON.parse(await manifestFile.text()) as Record<string, string | null>;
    const files = directory.list().filter((item): item is File => item instanceof File && item.name !== 'manifest.json');
    for (const [key, value] of Object.entries(manifest)) {
      if (value !== null) {
        store.set(key, value);
        continue;
      }
      // Valore lungo (es. la lista delle attività): si cerca il file che contiene una lista JSON.
      if (key.endsWith(LEGACY.activities)) {
        for (const file of files) {
          const text = await file.text();
          if (text.trim().startsWith('[')) {
            store.set(key, text);
            break;
          }
        }
      }
    }
  }
  return store;
}
