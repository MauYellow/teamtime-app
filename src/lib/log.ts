// Log della sessione (equivalente di "LogError List" di Thunkable): mostrato nella schermata Log Error
// e inviabile allo sviluppatore. Il più recente è il primo.

const MAX_ENTRIES = 300;
const entries: string[] = [];

export function log(message: string) {
  const time = new Date().toLocaleTimeString('it-IT');
  entries.unshift(`[${time}] ${message}`);
  if (entries.length > MAX_ENTRIES) entries.length = MAX_ENTRIES;
  if (__DEV__) console.log(message);
}

export function getLog() {
  return [...entries];
}
