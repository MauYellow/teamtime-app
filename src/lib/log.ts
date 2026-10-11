import Storage from 'expo-sqlite/kv-store';

// Log dell'app (equivalente di "LogError List" di Thunkable): mostrato nella schermata Log Error e inviabile allo
// sviluppatore. Il più recente è il primo. [miglioria] Salvato sul telefono: resta anche dopo la chiusura dell'app,
// così un errore di ieri si può ancora inviare (ultime 300 righe, ogni apertura segnata da una riga separatrice).

const KEY = 'registroLog';
const MAX_ENTRIES = 300;
/** Scrittura sul telefono raggruppata (non a ogni riga). */
const SAVE_DELAY_MS = 500;

const entries: string[] = loadSaved();
let saveTimer: ReturnType<typeof setTimeout> | null = null;

function loadSaved(): string[] {
  try {
    const list = JSON.parse(Storage.getItemSync(KEY) ?? '[]');
    return Array.isArray(list) ? list.filter((item) => typeof item === 'string') : [];
  } catch {
    return [];
  }
}

function scheduleSave() {
  if (saveTimer) return;
  saveTimer = setTimeout(() => {
    saveTimer = null;
    try {
      Storage.setItemSync(KEY, JSON.stringify(entries));
    } catch {
      // il log non deve mai bloccare l'app
    }
  }, SAVE_DELAY_MS);
}

/** "11/10 09:02:15" */
function stamp() {
  const now = new Date();
  return `${now.getDate()}/${now.getMonth() + 1} ${now.toLocaleTimeString('it-IT')}`;
}

export function log(message: string) {
  entries.unshift(`[${stamp()}] ${message}`);
  if (entries.length > MAX_ENTRIES) entries.length = MAX_ENTRIES;
  scheduleSave();
  if (__DEV__) console.log(message);
}

export function getLog() {
  return [...entries];
}

log('──── Apertura app ────');
