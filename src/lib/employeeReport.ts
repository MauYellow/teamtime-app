import { Directory, File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import Storage from 'expo-sqlite/kv-store';
import { Platform } from 'react-native';
import * as XLSX from 'xlsx';

import {
  calendarMonthLabel,
  dayKey,
  presenceDay,
  recordsOfCalendarMonth,
  type CalendarMonth,
} from '@/components/PresenceCalendar';
import { companyName, getSavedHistory } from '@/lib/history';
import { hoursOf, isAtWork, type Presenza } from '@/lib/manager';

// Calendario del dipendente e report Excel (SPEC §6.1, 4.1.0, decisioni dell'utente del 17/11/2026).
// L'unica fonte è il registro online: il calendario usa la copia di Airtable che l'app tiene già (lib/history.ts,
// riletta ogni 30 minuti), quindi nessuna chiamata in più e nessun archivio sul telefono. Le righe cancellate dal
// registro (limite Max Rows) spariscono anche qui: per conservarle il dipendente scarica l'Excel del mese.

/** Testo dell'avviso nella schermata del calendario (approvato dall'utente). */
export const RETENTION_DISCLAIMER =
  'Il registro online conserva solo un numero limitato di timbrature: le più vecchie vengono cancellate ' +
  'automaticamente per far spazio a quelle nuove, anche per motivi di privacy, e non si possono più recuperare. Per ' +
  'tenerne una copia, scarica il report Excel di ogni mese.';

/** Presenza con la sua azienda (con l'Intercambio il dipendente può avere righe in più tabelle). */
export type EmployeePresenza = Presenza & { table: string };

/** Righe del dipendente nelle aziende indicate, dalla copia di Airtable. */
export function employeeRecords(tables: string[], name: string | null): EmployeePresenza[] {
  return tables.flatMap((table) =>
    (getSavedHistory(table, name)?.records ?? []).map((record) => ({ ...record, table }))
  );
}

/** Giorno della timbratura più vecchia ancora nel registro (AAAA-MM-GG), o null se non ce ne sono. */
export function oldestAvailableDay(records: Presenza[]) {
  let oldest: string | null = null;
  for (const record of records) {
    const day = presenceDay(record);
    if (!oldest || day < oldest) oldest = day;
  }
  return oldest;
}

/** "2026-10-03" → "3/10/2026" */
export function shortDate(day: string) {
  const [year, month, date] = day.split('-').map(Number);
  return `${date}/${month}/${year}`;
}

/** Mese precedente a oggi. */
export function previousMonth(): CalendarMonth {
  const date = new Date();
  date.setDate(1);
  date.setMonth(date.getMonth() - 1);
  return { year: date.getFullYear(), month: date.getMonth() };
}

/** "2026-10" (parametro della schermata e chiave dell'avviso). */
export function monthParam(month: CalendarMonth) {
  return dayKey(month.year, month.month, 1).slice(0, 7);
}

export function parseMonthParam(value: string | undefined): CalendarMonth | null {
  const match = /^(\d{4})-(\d{2})$/.exec(value ?? '');
  if (!match) return null;
  const month = Number(match[2]) - 1;
  return month >= 0 && month <= 11 ? { year: Number(match[1]), month } : null;
}

// --- Excel del mese ---

const EXCEL_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

function round2(value: number) {
  return Math.round(value * 100) / 100;
}

function fileName(name: string, month: CalendarMonth) {
  const safeName = name.trim().replace(/\s+/g, '_').replace(/[^\p{L}\p{N}_-]/gu, '');
  return `TeamTime_${safeName}_${calendarMonthLabel(month).replace(' ', '_')}.xlsx`;
}

/**
 * Foglio del mese: Giorno, Entrata, Uscita, Ore (decimali) e, con più aziende, Azienda; in fondo il totale (formula),
 * la data della timbratura più vecchia ancora nel registro e l'avviso. Niente GPS (scelta dell'utente).
 */
function reportBytes(name: string, month: CalendarMonth, records: EmployeePresenza[], oldest: string | null) {
  const rows = recordsOfCalendarMonth(records, month) as EmployeePresenza[];
  const multi = new Set(rows.map((record) => record.table)).size > 1;
  const header = ['Giorno', 'Entrata', 'Uscita', 'Ore', ...(multi ? ['Azienda'] : [])];
  const body = rows.map((record) => [
    shortDate(presenceDay(record)),
    record.fields.Entrata ?? '',
    isAtWork(record) ? 'Al lavoro' : (record.fields.Uscita ?? ''),
    round2(hoursOf(record)),
    ...(multi ? [companyName(record.table)] : []),
  ]);
  const totalRow = body.length + 2;
  const sheet = XLSX.utils.aoa_to_sheet([
    [`${name.trim()} – ${calendarMonthLabel(month)}`],
    header,
    ...body,
  ]);
  // Il titolo è nella riga 1, le intestazioni nella 2, i dati dalla 3.
  XLSX.utils.sheet_add_aoa(
    sheet,
    [['Totale ore', '', '', body.length > 0 ? { t: 'n', f: `SUM(D3:D${totalRow})` } : 0]],
    { origin: `A${totalRow + 1}` }
  );
  XLSX.utils.sheet_add_aoa(
    sheet,
    [
      [oldest ? `Timbrature disponibili nel registro dal ${shortDate(oldest)}` : 'Nessuna timbratura nel registro'],
      ['Ore in formato decimale: 8,50 = 8 ore e 30 minuti'],
      [RETENTION_DISCLAIMER],
      ['Report generato automaticamente – TeamTime App - Registro Presenze'],
    ],
    { origin: `A${totalRow + 3}` }
  );
  sheet['!cols'] = [{ wch: 14 }, { wch: 10 }, { wch: 10 }, { wch: 8 }, { wch: 24 }];

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, sheet, 'Report');
  return new Uint8Array(XLSX.write(workbook, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer);
}

/** Pannello di condivisione (Salva su File, Drive, WhatsApp, mail...). */
export async function shareEmployeeReport(
  name: string,
  month: CalendarMonth,
  records: EmployeePresenza[],
  oldest: string | null
) {
  const file = new File(Paths.cache, fileName(name, month));
  if (file.exists) file.delete();
  file.write(reportBytes(name, month, records, oldest));
  await Sharing.shareAsync(file.uri, {
    mimeType: EXCEL_MIME,
    UTI: 'org.openxmlformats.spreadsheetml.sheet',
    dialogTitle: `Report ${calendarMonthLabel(month)}`,
  });
}

/**
 * "Scarica Excel". Android: il dipendente sceglie la cartella (es. Download) e il file si salva lì; "cancelled" se
 * chiude la scelta. iPhone: non c'è una cartella Download, si apre il pannello con "Salva su File" ("shared").
 * Come il report del manager (lib/manager.ts).
 */
export async function saveEmployeeReport(
  name: string,
  month: CalendarMonth,
  records: EmployeePresenza[],
  oldest: string | null
): Promise<'saved' | 'cancelled' | 'shared'> {
  if (Platform.OS !== 'android') {
    await shareEmployeeReport(name, month, records, oldest);
    return 'shared';
  }
  let directory: Directory;
  try {
    directory = await Directory.pickDirectoryAsync();
  } catch {
    return 'cancelled';
  }
  const file = directory.createFile(fileName(name, month), EXCEL_MIME);
  file.write(reportBytes(name, month, records, oldest));
  return 'saved';
}

// --- Avvisi in Home ---

const REPORT_NOTICE_KEY = 'avvisoReportChiuso'; // mese "AAAA-MM" del report già scaricato o chiuso con la X
const CALENDAR_NOTICE_KEY = 'avvisoCalendarioChiuso'; // 'true' dopo la X sull'avviso della novità (4.1.0)
/** L'avviso del report del mese precedente resta nei primi giorni del mese (scelta dell'utente: 5). */
export const REPORT_NOTICE_DAYS = 5;

function read(key: string) {
  try {
    return Storage.getItemSync(key);
  } catch {
    return null;
  }
}

function write(key: string, value: string) {
  try {
    Storage.setItemSync(key, value);
  } catch {
    // un avviso che ricompare non è un problema
  }
}

/**
 * Avviso "report da scaricare": nei primi 5 giorni del mese, se nel registro ci sono timbrature del mese precedente e
 * il dipendente non l'ha già chiuso o scaricato. Restituisce il mese e la timbratura più vecchia ancora disponibile.
 */
export function reportNotice(records: EmployeePresenza[]) {
  if (new Date().getDate() > REPORT_NOTICE_DAYS) return null;
  const month = previousMonth();
  if (read(REPORT_NOTICE_KEY) === monthParam(month)) return null;
  const rows = recordsOfCalendarMonth(records, month);
  if (rows.length === 0) return null;
  return { month, oldest: oldestAvailableDay(rows) };
}

/** Report del mese chiuso con la X o scaricato: l'avviso di quel mese non torna. */
export function closeReportNotice(month: CalendarMonth) {
  write(REPORT_NOTICE_KEY, monthParam(month));
}

export function isCalendarNoticeClosed() {
  return read(CALENDAR_NOTICE_KEY) === 'true';
}

export function closeCalendarNotice() {
  write(CALENDAR_NOTICE_KEY, 'true');
}
