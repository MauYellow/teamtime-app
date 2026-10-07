import { Platform } from 'react-native';

import { APP_VERSION } from '@/config';
import { log } from '@/lib/log';
import { getSession } from '@/lib/session';

// Log su Telegram (canale dello sviluppatore), come nell'app originale. Non blocca mai l'app.

export async function sendTelegram(text: string) {
  const settings = getSession().settings;
  if (!settings?.telegramBotKey || !settings.telegramChannelId) return;
  try {
    const response = await fetch(`https://api.telegram.org/bot${settings.telegramBotKey}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: settings.telegramChannelId, text, parse_mode: 'Markdown' }),
    });
    log(`Telegram: HTTP ${response.status}`);
  } catch (error) {
    log(`Telegram non inviato: ${String(error)}`);
  }
}

/** Messaggio di timbratura nel formato dell'app Thunkable. */
export function scanTelegramText(name: string, locale: string, kind: 'Entrata' | 'Uscita', response: string) {
  const device = Platform.OS === 'ios' ? 'Apple' : 'Android';
  return `*Nome*: ${name} *Azienda*: ${locale} *Versione*: ${APP_VERSION} *Dispositivo*: ${device} *${kind}*: ${response}`;
}
