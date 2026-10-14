import { Alert, Linking, Platform } from 'react-native';

import {
  ANDROID_PACKAGE,
  ASSISTANCE_FORM_URL,
  IOS_APP_STORE_ID,
  REVIEW_EVERY_MANAGER_LOGINS,
  REVIEW_EVERY_SCANS,
} from '@/config';
import { log } from '@/lib/log';
import {
  getReviewLogins,
  getReviewScans,
  isReviewDone,
  setReviewDone,
  setReviewLogins,
  setReviewScans,
} from '@/lib/storage';

// Richiesta di recensione ogni REVIEW_EVERY_SCANS scansioni riuscite (entrate + uscite), decisione dell'utente.
// "Recensisci" apre la pagina della recensione sullo store e non si chiede più; "Non ora" e "Segnala un problema"
// ripartono da zero. [develop 14/10/2026] Secondo contatore per i titolari: ogni REVIEW_EVERY_MANAGER_LOGINS accessi
// riusciti al Registro Online (decisione dell'utente); la risposta azzera entrambi i contatori.
// [miglioria] L'originale dopo 40 aperture mostrava un alert che obbligava a recensire (vietato dagli store).

/** Da chiamare dopo ogni timbratura registrata correttamente. */
export function countScanForReview() {
  if (isReviewDone()) return;
  const count = getReviewScans() + 1;
  setReviewScans(count);
  log(`Recensione: timbrature ${count}/${REVIEW_EVERY_SCANS}`);
}

/** Da chiamare dopo ogni accesso riuscito al Registro Online. */
export function countManagerLoginForReview() {
  if (isReviewDone()) return;
  const count = getReviewLogins() + 1;
  setReviewLogins(count);
  log(`Recensione: accessi al Registro Online ${count}/${REVIEW_EVERY_MANAGER_LOGINS}`);
}

export function shouldAskReview() {
  return (
    !isReviewDone() &&
    (getReviewScans() >= REVIEW_EVERY_SCANS || getReviewLogins() >= REVIEW_EVERY_MANAGER_LOGINS)
  );
}

function resetCounters() {
  setReviewScans(0);
  setReviewLogins(0);
}

function reviewUrl() {
  return Platform.OS === 'ios'
    ? `https://apps.apple.com/app/id${IOS_APP_STORE_ID}?action=write-review`
    : `https://play.google.com/store/apps/details?id=${ANDROID_PACKAGE}`;
}

async function open(url: string) {
  try {
    await Linking.openURL(url);
  } catch (error) {
    log(`Recensione: link non aperto ${String(error)}`);
  }
}

/**
 * Pannello con tre bottoni: "Recensisci" apre lo store e non si chiede più; "Non ora" riparte da zero;
 * "Segnala un problema" (a sinistra su Android) apre il modulo di assistenza e riparte da zero.
 */
export function askReview() {
  const later = () => {
    log('Recensione: "Non ora", contatori azzerati');
    resetCounters();
  };
  Alert.alert(
    'Ti piace TeamTime? ⭐⭐⭐⭐⭐',
    "Condividi cosa ne pensi dell'app, il tuo contributo è vitale. Grazie!",
    [
      {
        text: 'Segnala un problema',
        onPress: () => {
          log('Recensione: "Segnala un problema"');
          resetCounters();
          open(ASSISTANCE_FORM_URL);
        },
      },
      { text: 'Non ora', style: 'cancel', onPress: later },
      {
        text: 'Recensisci',
        isPreferred: true,
        onPress: () => {
          log('Recensione: "Recensisci", apro lo store');
          setReviewDone();
          open(reviewUrl());
        },
      },
    ],
    { cancelable: true, onDismiss: later }
  );
}
