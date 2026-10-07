import type { Activity } from '@/lib/storage';

// Formati di date e ore usati dall'app Thunkable e dal portale (vedi SPEC §1.1 e §1.3).

/** Ora come la scrive Thunkable su Airtable: ore senza zero iniziale, minuti con zero ("9:05", "15:29"). */
export function formatTime(date: Date) {
  return `${date.getHours()}:${String(date.getMinutes()).padStart(2, '0')}`;
}

/** Data locale AAAA-MM-GG. */
export function isoDate(date: Date) {
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

/** Data come la mostrava Thunkable: G/M/AAAA. */
export function formatItalianDate(iso: string) {
  const [year, month, day] = iso.split('-').map(Number);
  return `${day}/${month}/${year}`;
}

/** Riga delle "Ultime attività": "<Locale> - <G/M/AAAA> - Entrata - <H:mm>". */
export function activityLabel(activity: Activity) {
  if (!activity.date || !activity.type || !activity.time) return activity.raw ?? '';
  return `${activity.locale} - ${formatItalianDate(activity.date)} - ${activity.type} - ${activity.time}`;
}

/**
 * Interpreta una riga di ListaDipendenteOrari della vecchia app.
 * Il separatore esatto non è leggibile negli screenshot: si cercano data, tipo e ora, e il locale è il testo iniziale.
 */
export function parseLegacyActivity(raw: string): Activity {
  const text = String(raw).trim();
  const date = text.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  const type = text.match(/\b(Entrata|Uscita)\b/i);
  const afterType = type ? text.slice((type.index ?? 0) + type[0].length) : '';
  const time = afterType.match(/(\d{1,2}):(\d{1,2})/);
  const locale = date ? text.slice(0, date.index).replace(/[\s\-–—|,.:·•]+$/u, '').trim() : '';

  if (!date || !type || !time) return { locale, date: null, type: null, time: null, raw: text };
  const iso = `${date[3]}-${date[2].padStart(2, '0')}-${date[1].padStart(2, '0')}`;
  const kind = type[1].toLowerCase() === 'entrata' ? 'Entrata' : 'Uscita';
  return { locale, date: iso, type: kind, time: `${Number(time[1])}:${time[2].padStart(2, '0')}`, raw: text };
}
