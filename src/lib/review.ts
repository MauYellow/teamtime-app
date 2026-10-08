import { Linking, Platform } from 'react-native';

import { ANDROID_PACKAGE, IOS_APP_STORE_ID, REVIEW_EVERY_SCANS } from '@/config';
import { confirmAlert } from '@/lib/dialogs';
import { log } from '@/lib/log';
import { getReviewScans, isReviewDone, setReviewDone, setReviewScans } from '@/lib/storage';

// Richiesta di recensione ogni REVIEW_EVERY_SCANS scansioni riuscite (entrate + uscite), decisione dell'utente.
// "Ok" apre la pagina della recensione sullo store e non si chiede più; "Non ora" riparte da zero.
// [miglioria] L'originale dopo 40 aperture mostrava un alert che obbligava a recensire (vietato dagli store).

/** Da chiamare dopo ogni timbratura registrata correttamente. */
export function countScanForReview() {
  if (isReviewDone()) return;
  setReviewScans(getReviewScans() + 1);
}

export function shouldAskReview() {
  return !isReviewDone() && getReviewScans() >= REVIEW_EVERY_SCANS;
}

function reviewUrl() {
  return Platform.OS === 'ios'
    ? `https://apps.apple.com/app/id${IOS_APP_STORE_ID}?action=write-review`
    : `https://play.google.com/store/apps/details?id=${ANDROID_PACKAGE}`;
}

export async function askReview() {
  const ok = await confirmAlert(
    'Ti piace TeamTime?',
    'Se TeamTime ti è utile, lasciaci una recensione: ci aiuta a migliorare!',
    { cancel: 'Non ora', confirm: 'Ok' }
  );
  if (!ok) {
    log('Recensione: "Non ora", contatore azzerato');
    setReviewScans(0);
    return;
  }
  log('Recensione: "Ok", apro lo store');
  setReviewDone();
  try {
    await Linking.openURL(reviewUrl());
  } catch (error) {
    log(`Recensione: store non aperto ${String(error)}`);
  }
}
