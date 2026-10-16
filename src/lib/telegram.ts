import { APP_VERSION } from '@/config';
import { api } from '@/lib/api';
import { DEVICE } from '@/lib/device';
import { log } from '@/lib/log';

// Log su Telegram (canale dello sviluppatore), come nell'app originale, tramite il proxy (la chiave del bot resta sul
// server, SPEC §18). Non blocca mai l'app.
// [16/10/2026, privacy] Nei messaggi delle timbrature solo azienda, iniziali del dipendente, orario, dispositivo e
// versione dell'app: niente nome intero né indirizzo GPS. Gli errori arrivano sempre, con il motivo tecnico.

export async function sendTelegram(text: string) {
  try {
    await api('/telegram', { text });
  } catch (error) {
    log(`Telegram non inviato: ${String(error)}`);
  }
}

/** "Mario De Rossi" → "M.D.R." */
export function initials(name: string) {
  return name
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => `${word.charAt(0).toUpperCase()}.`)
    .join('');
}

/** Testo sicuro per il Markdown di Telegram (altrimenti un "_" in un errore fa rifiutare il messaggio). */
export function telegramSafe(text: string) {
  return text.replace(/([_*`[])/g, '\\$1');
}

/** Riga fissa con dispositivo e versione dell'app. */
function deviceLine() {
  return `Dispositivo: ${DEVICE} · App ${APP_VERSION}`;
}

export type ScanTelegram =
  | { ok: true; time: string; note?: string }
  /** `error`: motivo tecnico (codice del proxy, connessione...), senza dati personali. */
  | { ok: false; time: string; error: string };

/**
 * Messaggio di una timbratura, su più righe:
 *   *Entrata registrata*            *ERRORE ENTRATA*
 *   Azienda: teamtime031            Azienda: teamtime031
 *   Dipendente: M.R.                Dipendente: M.R.
 *   Orario: 9:02                    Orario del tentativo: 9:02
 *   Dispositivo: Android · App 4.0.0 Dispositivo: Android · App 4.0.0
 *                                   Errore: Proxy /presenze/entry HTTP 502 airtable
 */
export function scanTelegramText(name: string, table: string, kind: 'Entrata' | 'Uscita', result: ScanTelegram) {
  const lines = [
    result.ok ? `*${kind} registrata*` : `*ERRORE ${kind.toUpperCase()}*`,
    `Azienda: ${telegramSafe(table)}`,
    `Dipendente: ${telegramSafe(initials(name)) || '—'}`,
    `${result.ok ? 'Orario' : 'Orario del tentativo'}: ${result.time}`,
    deviceLine(),
  ];
  if (result.ok && result.note) lines.push(telegramSafe(result.note));
  if (!result.ok) lines.push(`Errore: ${telegramSafe(result.error)}`);
  return lines.join('\n');
}

/** Uscita dimenticata inserita dal dipendente da Gestisci. */
export function correctionTelegramText(name: string, table: string, shift: string, entry: string, exit: string) {
  return [
    '*Uscita inserita dal dipendente*',
    `Azienda: ${telegramSafe(table)}`,
    `Dipendente: ${telegramSafe(initials(name)) || '—'}`,
    `Turno: ${telegramSafe(shift)}, ${entry || '—'} → ${exit}`,
    deviceLine(),
  ].join('\n');
}

/** Errore all'avvio dell'app (Splash), con il motivo tecnico. */
export function startupErrorTelegramText(what: string, attempt: number, error: string) {
  return [
    '*ERRORE AVVIO APP*',
    `Caricamento: ${telegramSafe(what)} (tentativo ${attempt})`,
    deviceLine(),
    `Errore: ${telegramSafe(error)}`,
  ].join('\n');
}
