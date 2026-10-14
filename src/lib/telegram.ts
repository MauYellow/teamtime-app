import { APP_VERSION } from '@/config';
import { api } from '@/lib/api';
import { DEVICE } from '@/lib/device';
import { log } from '@/lib/log';

// Log su Telegram (canale dello sviluppatore), come nell'app originale, tramite il proxy (la chiave del bot resta sul
// server, SPEC §18). Non blocca mai l'app.

export async function sendTelegram(text: string) {
  try {
    await api('/telegram', { text });
  } catch (error) {
    log(`Telegram non inviato: ${String(error)}`);
  }
}

/** Messaggio di timbratura nel formato dell'app Thunkable. */
export function scanTelegramText(name: string, locale: string, kind: 'Entrata' | 'Uscita', response: string) {
  return `*Nome*: ${name} *Azienda*: ${locale} *Versione*: ${APP_VERSION} *Dispositivo*: ${DEVICE} *${kind}*: ${response}`;
}
