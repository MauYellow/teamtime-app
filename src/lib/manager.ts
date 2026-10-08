import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import * as XLSX from 'xlsx';

import { formatTime } from '@/lib/activities';
import { createRecord, findFirst, formulaString, listRecords, updateRecord, type AirtableRecord } from '@/lib/airtable';
import { LOCALI_TABLE, type LocaleFields } from '@/lib/locali';

// Registro Online e area manager (SPEC §7 e §8), con gli stessi formati del portale web.

export const LOGIN_MESSAGES = {
  notFound: 'Azienda non trovata (il sistema riconosce la differenza tra maiuscole e minuscole)',
  wrongPassword: 'Password incorretta',
  disabled: "Questo account risulta disattivato, contattare l'assistenza",
};

export type LoginResult = { ok: true; locale: LocaleFields } | { ok: false; message: string };

/**
 * Login del manager con il nome del QR (sensibile alle maiuscole, come Thunkable) oppure con la Mail
 * ([miglioria] come il portale; la mail senza distinguere maiuscole).
 */
export async function loginManager(username: string, password: string): Promise<LoginResult> {
  const user = username.trim();
  const formula = user.includes('@')
    ? `LOWER(TRIM({Mail})) = LOWER(${formulaString(user)})`
    : `{Locale} = ${formulaString(user)}`;
  const record = await findFirst<LocaleFields>(LOCALI_TABLE, formula);
  if (!record?.fields.Locale) return { ok: false, message: LOGIN_MESSAGES.notFound };
  if (String(record.fields.Password ?? '').trim() !== password.trim()) {
    return { ok: false, message: LOGIN_MESSAGES.wrongPassword };
  }
  if (record.fields.Status !== 'Attivo') return { ok: false, message: LOGIN_MESSAGES.disabled };
  return { ok: true, locale: record.fields };
}

/** Riga di presenza come la legge l'area manager. */
export type PresenzaFields = {
  Nome?: string;
  Entrata?: string;
  Uscita?: string;
  Created?: string;
  'Mese Nome'?: string;
  Anno?: string;
  Giorni?: string;
  'Giorno Corretto'?: string;
  'Ore Lavorate'?: number | { specialValue: string };
};

export type Presenza = AirtableRecord<PresenzaFields>;

/** Ore lavorate come numero (0 se la formula dà NaN, cioè il dipendente è ancora al lavoro). */
export function hoursOf(record: Presenza) {
  const value = record.fields['Ore Lavorate'];
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

/** "Al lavoro" senza distinguere maiuscole: il portale scrive "Al Lavoro". */
export function isAtWork(record: Presenza) {
  return record.fields.Uscita?.trim().toLowerCase() === 'al lavoro';
}

/** Data della presenza G/M/AAAA (da Created, che può essere una data o una data e ora). */
export function presenzaDate(record: Presenza) {
  const created = record.fields.Created ?? record.createdTime;
  const date = new Date(created.length === 10 ? `${created}T12:00:00` : created);
  if (Number.isNaN(date.getTime())) return created;
  return `${date.getDate()}/${date.getMonth() + 1}/${date.getFullYear()}`;
}

// --- Correggi Orari ---

/** Presenze ancora "al lavoro", le più recenti prima. [miglioria] senza distinguere maiuscole. */
export function fetchOpenPresenze(table: string) {
  return listRecords<PresenzaFields>(table, {
    filterByFormula: 'LOWER(TRIM({Uscita})) = "al lavoro"',
    sort: [{ field: 'Created', direction: 'desc' }],
  });
}

/** Imposta l'uscita. [miglioria] minuti sempre a due cifre (l'originale poteva scrivere "18:5"). */
export function setExitTime(table: string, recordId: string, time: Date) {
  return updateRecord<PresenzaFields>(table, recordId, { Uscita: formatTime(time) });
}

// --- Conteggio ---

const MONTHS = [
  'gennaio',
  'febbraio',
  'marzo',
  'aprile',
  'maggio',
  'giugno',
  'luglio',
  'agosto',
  'settembre',
  'ottobre',
  'novembre',
  'dicembre',
];

export type Month = { key: string; month: string; year: string; label: string };

/** Tutte le presenze della tabella (al massimo Max Rows righe: poche chiamate). */
export function fetchAllPresenze(table: string) {
  return listRecords<PresenzaFields>(table, { sort: [{ field: 'Created', direction: 'desc' }] });
}

function monthOf(record: Presenza): Month | null {
  const month = record.fields['Mese Nome']?.trim().toLowerCase();
  const year = String(record.fields.Anno ?? '').trim();
  if (!month) return null;
  return { key: `${month} ${year}`, month, year, label: `${month.charAt(0).toUpperCase()}${month.slice(1)} ${year}`.trim() };
}

/** Mesi presenti nelle righe, dal più recente. [miglioria] separati per anno (il portale usava solo il nome). */
export function availableMonths(records: Presenza[]): Month[] {
  const months = new Map<string, Month>();
  for (const record of records) {
    const month = monthOf(record);
    if (month) months.set(month.key, month);
  }
  const order = (month: Month) => Number(month.year || 0) * 100 + MONTHS.indexOf(month.month);
  return [...months.values()].sort((a, b) => order(b) - order(a));
}

export function recordsOfMonth(records: Presenza[], month: Month) {
  return records.filter((record) => monthOf(record)?.key === month.key);
}

/** Chiave del dipendente. [miglioria] "Erica Piccinini" = "erica piccinini " (il portale li separava). */
function nameKey(name: string) {
  return name.trim().replace(/\s+/g, ' ').toLowerCase();
}

export type EmployeeTotal = { name: string; hours: number; atWork: number; days: Map<string, number> };

/** Ore per dipendente nel mese, con le ore di ogni giorno (Giorno Corretto se presente, altrimenti Giorni). */
export function employeeTotals(records: Presenza[]): EmployeeTotal[] {
  const totals = new Map<string, EmployeeTotal>();
  for (const record of records) {
    const name = record.fields.Nome?.trim() || 'Sconosciuto';
    const key = nameKey(name);
    const total = totals.get(key) ?? { name, hours: 0, atWork: 0, days: new Map<string, number>() };
    const hours = hoursOf(record);
    total.hours += hours;
    if (isAtWork(record)) total.atWork += 1;
    const day = Number(record.fields['Giorno Corretto'] || record.fields.Giorni);
    if (day >= 1 && day <= 31) {
      const dayKey = String(day).padStart(2, '0');
      total.days.set(dayKey, (total.days.get(dayKey) ?? 0) + hours);
    }
    totals.set(key, total);
  }
  return [...totals.values()].sort((a, b) => a.name.localeCompare(b.name, 'it'));
}

export function formatHours(hours: number) {
  return hours.toFixed(2);
}

/**
 * "Invia Mail": riga nella tabella Mail, l'automazione Airtable "Mail dopo Conteggio Ore" la invia alla mail del
 * locale. Stesso formato delle righe create dall'app Thunkable (" Nome: 133.80 ore").
 */
export function sendTotalsMail(locale: LocaleFields, month: Month, totals: EmployeeTotal[]) {
  const total = totals.reduce((sum, item) => sum + item.hours, 0);
  return createRecord('Mail', {
    Locale: locale.Locale,
    Mail: locale.Mail,
    Mese: month.month,
    'Totale Orari': totals.map((item) => ` ${item.name}: ${formatHours(item.hours)} ore`).join('\n'),
    'Totale Ore Lavorate': String(Math.round(total * 100) / 100),
  });
}

/**
 * Report Excel nello stesso formato del portale: Nome Cognome, giorni 01–31, Totale (formula), Mese, Anno.
 * [miglioria] il file si crea nell'app e si condivide (l'originale compilava un Google Sheet).
 */
export async function shareExcelReport(locale: string, month: Month, totals: EmployeeTotal[]) {
  const days = Array.from({ length: 31 }, (_, index) => String(index + 1).padStart(2, '0'));
  const header = ['Nome Cognome', ...days, 'Totale', 'Mese', 'Anno'];
  const rows: (string | number | XLSX.CellObject)[][] = totals.map((item, index) => [
    item.name,
    ...days.map((day) => Math.round((item.days.get(day) ?? 0) * 100) / 100),
    { t: 'n', f: `SUM(B${index + 2}:AF${index + 2})` },
    month.month,
    month.year,
  ]);
  const sheet = XLSX.utils.aoa_to_sheet([header, ...rows]);
  sheet['!cols'] = [{ wch: 30 }];
  const footerRow = rows.length + 3;
  XLSX.utils.sheet_add_aoa(sheet, [['Report generato automaticamente'], ['TeamTime App - Registro Presenze']], {
    origin: `A${footerRow}`,
  });
  sheet[`A${footerRow + 1}`].l = { Target: 'https://teamtimeapp.it' };

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, sheet, 'Report');
  const bytes = new Uint8Array(XLSX.write(workbook, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer);

  const file = new File(Paths.cache, `${locale}_${month.month}_${month.year}_report.xlsx`);
  if (file.exists) file.delete();
  file.write(bytes);
  await Sharing.shareAsync(file.uri, {
    mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    UTI: 'org.openxmlformats.spreadsheetml.sheet',
    dialogTitle: `Report ${month.label}`,
  });
}

/** URL del calendario incorporabile, come nel portale ("airtable.com/embed/…?viewControls=on"). */
export function calendarUrl(locale: LocaleFields) {
  const url = locale['URL Monitor']?.trim();
  if (!url) return null;
  return `${url.replace('https://airtable.com/', 'https://airtable.com/embed/')}?viewControls=on`;
}
