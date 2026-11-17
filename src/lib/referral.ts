import Storage from 'expo-sqlite/kv-store';
import { Linking } from 'react-native';

import { WHATSAPP_SUPPORT_URL } from '@/config';
import { companyName } from '@/lib/history';
import { log } from '@/lib/log';

// "Consiglia TeamTime" (4.1.0, decisione dell'utente del 17/11/2026): avviso in Home per i dipendenti registrati.
// Il tocco apre WhatsApp con Maurizio e un messaggio già scritto con nome e azienda di chi consiglia (così si sa a chi
// spetta il premio). La X lo chiude per 60 giorni, poi ricompare.

const CLOSED_AT_KEY = 'avvisoConsigliaChiusoIl'; // momento (ms) della X
/** Dopo la X l'avviso ricompare dopo questi giorni (scelta dell'utente). */
export const REFERRAL_HIDDEN_DAYS = 60;

export function isReferralNoticeVisible() {
  try {
    const closedAt = Number(Storage.getItemSync(CLOSED_AT_KEY));
    return !closedAt || Date.now() - closedAt >= REFERRAL_HIDDEN_DAYS * 24 * 60 * 60_000;
  } catch {
    return true;
  }
}

export function closeReferralNotice() {
  try {
    Storage.setItemSync(CLOSED_AT_KEY, String(Date.now()));
  } catch {
    // un avviso che ricompare non è un problema
  }
  log('Consiglia TeamTime: avviso chiuso per 60 giorni');
}

/** Chat WhatsApp con il messaggio già scritto: "Ciao! Sono Mario Rossi (lavoro da Bar Roma) e vorrei consigliarti…". */
export function openReferralChat(name: string, locale: string) {
  const text =
    `Ciao! Sono ${name.trim()} (lavoro da ${companyName(locale)}) e vorrei consigliarti un'azienda per TeamTime: `;
  log('Consiglia TeamTime: apertura WhatsApp');
  Linking.openURL(`${WHATSAPP_SUPPORT_URL}?text=${encodeURIComponent(text)}`).catch((error) =>
    log(`Consiglia TeamTime: WhatsApp non aperto ${String(error)}`)
  );
}
