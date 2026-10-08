import { SETTING_KEYS, SETTINGS_CSV_URL } from '@/config';

// Impostazioni della nuova app da una scheda Google Sheet pubblicata sul web (colonna A = nome, colonna B = valore). Vedi SPEC §1.2.
// Si legge senza chiavi e senza chiamate ad Airtable.

export type AppSettings = {
  /** Ultima versione pubblicata (null se manca: il controllo viene saltato). */
  latestVersion: number | null;
};

/** Oltre questo tempo si prosegue senza il foglio, per non tenere ferma la Splash. */
const SETTINGS_TIMEOUT_MS = 8000;

const EMPTY: AppSettings = { latestVersion: null };

/** Righe di un CSV semplice (valori eventualmente tra virgolette, con "" per le virgolette interne). */
function parseCsv(text: string) {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (quoted) {
      if (char === '"' && text[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (char === '"') quoted = false;
      else cell += char;
    } else if (char === '"') quoted = true;
    else if (char === ',') {
      row.push(cell);
      cell = '';
    } else if (char === '\n' || char === '\r') {
      if (char === '\r' && text[i + 1] === '\n') i++;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
    } else cell += char;
  }
  if (cell || row.length) rows.push([...row, cell]);
  return rows;
}

export async function fetchAppSettings(): Promise<AppSettings> {
  if (!SETTINGS_CSV_URL) return EMPTY;
  const url = SETTINGS_CSV_URL;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), SETTINGS_TIMEOUT_MS);
  let text: string;
  try {
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok) throw new Error(`Google Sheet HTTP ${response.status}`);
    text = await response.text();
  } finally {
    clearTimeout(timer);
  }
  const rows = parseCsv(text);
  const value = (name: string) =>
    rows.find((row) => row[0]?.trim().toLowerCase() === name.toLowerCase())?.[1]?.trim() || null;

  const version = Number(String(value(SETTING_KEYS.version) ?? '').replace(',', '.'));
  return {
    latestVersion: Number.isFinite(version) && version > 0 ? version : null,
  };
}
