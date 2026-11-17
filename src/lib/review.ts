import { Alert, AppState, Linking, Platform } from 'react-native';

import {
  ANDROID_PACKAGE,
  ASSISTANCE_FORM_URL,
  IOS_APP_STORE_ID,
  REVIEW_EVERY_MANAGER_LOGINS,
  REVIEW_EVERY_REPORTS,
  REVIEW_EVERY_SCANS,
} from '@/config';
import { log } from '@/lib/log';
import {
  getReviewLogins,
  getReviewReports,
  getReviewScans,
  isReviewDone,
  setReviewDone,
  setReviewLogins,
  setReviewReports,
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

/** Aspetta che l'app torni in primo piano dopo l'apertura dello store (al massimo 10 minuti). */
function waitForReturn() {
  return new Promise<void>((resolve) => {
    let left = false;
    const timers: ReturnType<typeof setTimeout>[] = [];
    const subscription = AppState.addEventListener('change', (state) => {
      if (state !== 'active') left = true;
      else if (left) done();
    });
    function done() {
      subscription.remove();
      timers.forEach(clearTimeout);
      resolve();
    }
    // Se lo store non si apre l'app non va mai in background: si prosegue.
    timers.push(setTimeout(() => !left && done(), 2000));
    timers.push(setTimeout(done, 10 * 60_000));
  });
}

/**
 * [4.1.0, scelta dell'utente del 17/11/2026] Report Excel del dipendente: a un tocco su scarica/condividi sì e uno no
 * (2°, 4°, 6°...), finché non ha recensito, prima del file compare la richiesta di recensione. Il file parte comunque,
 * qualunque risposta (gli store vietano di condizionare una funzione alla recensione: il testo non lo dice). "Recensisci"
 * apre lo store, non si chiede più da nessuna parte e il file parte al ritorno nell'app; "Non ora" e "Segnala un
 * problema" azzerano solo il contatore dei report. Si risolve quando si può procedere con il file.
 */
export function askReviewBeforeReport(action: 'scaricare' | 'condividere'): Promise<void> {
  if (isReviewDone()) return Promise.resolve();
  const count = getReviewReports() + 1;
  setReviewReports(count);
  log(`Recensione: report ${count}/${REVIEW_EVERY_REPORTS}`);
  if (count < REVIEW_EVERY_REPORTS) return Promise.resolve();

  return new Promise<void>((resolve) => {
    let answered = false;
    const finish = (after?: Promise<void>) => {
      if (answered) return;
      answered = true;
      setReviewReports(0);
      (after ?? Promise.resolve()).then(resolve, resolve);
    };
    Alert.alert(
      'Ti piace TeamTime? ⭐⭐⭐⭐⭐',
      `Prima di ${action} il tuo report, ci lasci una recensione? Bastano pochi secondi e ci aiuti tantissimo.`,
      [
        {
          text: 'Segnala un problema',
          onPress: () => {
            log('Recensione (report): "Segnala un problema"');
            finish(open(ASSISTANCE_FORM_URL).then(waitForReturn));
          },
        },
        {
          text: 'Non ora',
          style: 'cancel',
          onPress: () => {
            log('Recensione (report): "Non ora"');
            finish();
          },
        },
        {
          text: 'Recensisci',
          isPreferred: true,
          onPress: () => {
            log('Recensione (report): "Recensisci", apro lo store');
            setReviewDone();
            finish(open(reviewUrl()).then(waitForReturn));
          },
        },
      ],
      {
        cancelable: true,
        onDismiss: () => {
          log('Recensione (report): chiusa senza risposta');
          finish();
        },
      }
    );
  });
}
