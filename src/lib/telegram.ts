import { APP_VERSION, TELEGRAM_BOT_KEY, TELEGRAM_CHANNEL_ID } from '@/config';
import { DEVICE } from '@/lib/device';
import { log } from '@/lib/log';

// Log su Telegram (canale dello sviluppatore), come nell'app originale. Non blocca mai l'app.

export async function sendTelegram(text: string) {
  if (!TELEGRAM_BOT_KEY || !TELEGRAM_CHANNEL_ID) return;
  try {
    const response = await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_KEY}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: TELEGRAM_CHANNEL_ID, text, parse_mode: 'Markdown' }),
    });
    log(`Telegram: HTTP ${response.status}`);
  } catch (error) {
    log(`Telegram non inviato: ${String(error)}`);
  }
}

/** Messaggio di timbratura nel formato dell'app Thunkable. */
export function scanTelegramText(name: string, locale: string, kind: 'Entrata' | 'Uscita', response: string) {
  return `*Nome*: ${name} *Azienda*: ${locale} *Versione*: ${APP_VERSION} *Dispositivo*: ${DEVICE} *${kind}*: ${response}`;
}
