import { usePathname } from 'expo-router';
import { useEffect, useRef } from 'react';
import { AppState } from 'react-native';

import { flushLog, log } from '@/lib/log';
import { backToHome } from '@/lib/navigation';

// Ritorno in primo piano (17/11/2026). Toccando l'icona, iOS e Android riprendono l'app sospesa dall'ultima schermata,
// senza una nuova apertura (e senza la riga "Apertura app" nel log). Se l'ultima schermata era l'esito verde di uno
// scan di ieri, il dipendente poteva scambiarlo per la timbratura di oggi. Ora:
// - il log registra ogni passaggio in background e ogni ritorno, con la schermata e il tempo passato;
// - dopo almeno 5 minuti in background, dall'esito dello scan si torna da soli alla Home.

/** Dopo questo tempo in background l'esito dello scan non si mostra più. */
export const RETURN_HOME_AFTER_MS = 5 * 60_000;

const SCREEN_NAMES: Record<string, string> = {
  '/': 'Avvio',
  '/home': 'Home',
  '/scan-result': 'Esito scan',
  '/log-error': 'Log Error',
  '/tutorial': 'Tutorial',
};

function screenName(pathname: string) {
  return SCREEN_NAMES[pathname] ?? pathname;
}

/** "45 secondi", "12 minuti", "3 ore e 5 minuti", "2 giorni e 4 ore" */
export function durationText(ms: number) {
  const minutes = Math.floor(ms / 60_000);
  if (minutes < 1) return `${Math.round(ms / 1000)} secondi`;
  if (minutes < 60) return `${minutes} minut${minutes === 1 ? 'o' : 'i'}`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) {
    const rest = minutes % 60;
    return `${hours} or${hours === 1 ? 'a' : 'e'}${rest ? ` e ${rest} minut${rest === 1 ? 'o' : 'i'}` : ''}`;
  }
  const days = Math.floor(hours / 24);
  const rest = hours % 24;
  return `${days} giorn${days === 1 ? 'o' : 'i'}${rest ? ` e ${rest} or${rest === 1 ? 'a' : 'e'}` : ''}`;
}

/** Da usare una volta sola, nel layout principale. */
export function useForegroundWatcher() {
  const pathname = usePathname();
  const pathnameRef = useRef(pathname);
  const backgroundAt = useRef<number | null>(null);

  useEffect(() => {
    pathnameRef.current = pathname;
  }, [pathname]);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      const screen = screenName(pathnameRef.current);
      if (state === 'background') {
        backgroundAt.current = Date.now();
        log(`App in background – schermata: ${screen}`);
        flushLog();
        return;
      }
      if (state !== 'active' || backgroundAt.current === null) return;
      const away = Date.now() - backgroundAt.current;
      backgroundAt.current = null;
      log(`App tornata in primo piano – schermata: ${screen} – in background da ${durationText(away)}`, true);
      if (pathnameRef.current === '/scan-result' && away >= RETURN_HOME_AFTER_MS) {
        log('Esito dello scan non più attuale: ritorno automatico alla Home', true);
        backToHome();
      }
    });
    return () => subscription.remove();
  }, []);
}
