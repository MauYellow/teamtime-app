import { Linking } from 'react-native';

import { WHATSAPP_SUPPORT_URL } from '@/config';
import { companyName } from '@/lib/history';
import { log } from '@/lib/log';

// "Porta una nuova azienda" (4.1.0, decisioni dell'utente del 17/11/2026): riquadro fisso in Home (tra il logo e il
// nome, senza X) per i dipendenti registrati. Il tocco apre WhatsApp con Maurizio e un messaggio già scritto con nome e
// azienda di chi consiglia (così si sa a chi spetta il premio).

/** Chat WhatsApp con il messaggio già scritto: "Ciao! Sono Mario Rossi (lavoro da Bar Roma) e vorrei consigliarti…". */
export function openReferralChat(name: string, locale: string) {
  const text =
    `Ciao! Sono ${name.trim()} (lavoro da ${companyName(locale)}) e vorrei consigliarti un'azienda per TeamTime: `;
  log('Consiglia TeamTime: apertura WhatsApp');
  Linking.openURL(`${WHATSAPP_SUPPORT_URL}?text=${encodeURIComponent(text)}`).catch((error) =>
    log(`Consiglia TeamTime: WhatsApp non aperto ${String(error)}`)
  );
}
