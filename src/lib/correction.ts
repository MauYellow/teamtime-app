import { formatTime } from '@/lib/activities';
import { setExit } from '@/lib/airtable';
import { addRecordToHistory, dayLabel, localDay, openPastShifts, removeRecordFromHistory, today } from '@/lib/history';
import { log } from '@/lib/log';
import { type Presenza, type PresenzaFields } from '@/lib/manager';
import type { LocalePreferences } from '@/lib/preferences';
import { getEmployeeName } from '@/lib/storage';
import { correctionTelegramText, sendTelegram } from '@/lib/telegram';

// Gestisci → correzione delle uscite dimenticate dal dipendente (SPEC §16). Vale subito (nessuna approvazione).
// Il manager la riconosce dal campo "GPS Uscita" = "Inserita dal dipendente" (nessun campo nuovo su Airtable).
// Una volta inserita l'uscita la riga non è più "al lavoro": non compare più tra i turni correggibili.

export const EMPLOYEE_EXIT_MARK = 'Inserita dal dipendente';

/** "AAAA-MM-GG" di N giorni fa. */
function daysAgo(days: number) {
  const date = new Date();
  date.setDate(date.getDate() - days);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

/** Turni "al lavoro" dei giorni precedenti, entro il limite di giorni del locale. */
export function correctableShifts(records: Presenza[], preferences: LocalePreferences) {
  const from = daysAgo(preferences.giorniCorrezione);
  return openPastShifts(records).filter((record) => localDay(record) >= from && localDay(record) < today());
}

/** Turni non chiusi più vecchi del limite: solo il manager può correggerli. */
export function tooOldShifts(records: Presenza[], preferences: LocalePreferences) {
  const from = daysAgo(preferences.giorniCorrezione);
  return openPastShifts(records).filter((record) => localDay(record) < from);
}

function minutesOf(time: string | undefined) {
  const match = /^(\d{1,2})[:.](\d{2})$/.exec(time?.trim() ?? '');
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  return hours < 24 && minutes < 60 ? hours * 60 + minutes : null;
}

export type ExitCheck = { ok: true; minutes: number } | { ok: false; message: string };

/**
 * Controlla l'orario di uscita scelto: l'uscita è sempre dopo l'entrata (se l'ora è minore o uguale, è il giorno dopo,
 * come la formula Ore Lavorate di Airtable) e il turno non supera la durata massima del locale.
 */
export function checkExit(record: Presenza, exit: Date, preferences: LocalePreferences): ExitCheck {
  const entry = minutesOf(record.fields.Entrata);
  if (entry === null) {
    return { ok: false, message: "L'orario di entrata di questo turno non è leggibile: chiedi al tuo responsabile." };
  }
  let minutes = exit.getHours() * 60 + exit.getMinutes() - entry;
  if (minutes <= 0) minutes += 24 * 60;
  if (minutes > preferences.oreMaxTurno * 60) {
    const hours = Math.floor(minutes / 60);
    const rest = minutes % 60;
    return {
      ok: false,
      message:
        `Con questa uscita il turno durerebbe ${hours} ore${rest ? ` e ${rest} minuti` : ''}: il massimo consentito ` +
        `è ${preferences.oreMaxTurno} ore. Controlla l'orario o chiedi al tuo responsabile.`,
    };
  }
  return { ok: true, minutes };
}

export type CorrectionResult = 'done' | 'alreadyClosed' | 'gone';

/**
 * Scrive l'uscita tramite il proxy (1 chiamata), che prima rilegge la riga: se nel frattempo il manager l'ha già chiusa
 * o cancellata non si tocca niente. Tabelle vecchie senza "GPS Uscita": il proxy scrive solo l'uscita. La riga
 * restituita entra nella copia.
 */
export async function correctExit(table: string, record: Presenza, exit: Date): Promise<CorrectionResult> {
  const time = formatTime(exit);
  const outcome = await setExit<PresenzaFields>(table, record.id, { Uscita: time, 'GPS Uscita': EMPLOYEE_EXIT_MARK });
  if (outcome.status === 'gone') {
    removeRecordFromHistory(table, record.id);
    log(`Gestisci: turno ${record.id} non più presente su Airtable`);
    return 'gone';
  }
  if (outcome.status === 'alreadyClosed') {
    addRecordToHistory(table, outcome.record);
    log(`Gestisci: turno ${record.id} già chiuso (uscita ${outcome.record.fields.Uscita})`);
    return 'alreadyClosed';
  }
  const updated = outcome.record;
  addRecordToHistory(table, updated);
  const name = getEmployeeName() ?? '';
  log(`Gestisci: uscita ${time} inserita dal dipendente per ${dayLabel(record)} (${record.id})`);
  sendTelegram(correctionTelegramText(name, table, dayLabel(record), record.fields.Entrata ?? '', time));
  return 'done';
}
