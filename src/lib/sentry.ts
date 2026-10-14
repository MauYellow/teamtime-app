import * as Sentry from '@sentry/react-native';

import { APP_VERSION, SENTRY_DSN } from '@/config';

// Sentry (SPEC §15.3): crash ed errori dell'app raccolti in automatico, regione dati UE. Solo dati tecnici: niente
// dati personali (nomi dei dipendenti, indirizzi GPS, mail), quindi niente log della console e niente indirizzi delle
// chiamate (le formule Airtable contengono i nomi). Senza DSN in .env Sentry resta spento.

export function initSentry() {
  if (!SENTRY_DSN) return;
  Sentry.init({
    dsn: SENTRY_DSN,
    environment: __DEV__ ? 'development' : 'production',
    release: `teamtime@${APP_VERSION}`,
    sendDefaultPii: false,
    beforeBreadcrumb(breadcrumb) {
      if (breadcrumb.category === 'console' || breadcrumb.category === 'fetch' || breadcrumb.category === 'xhr') {
        return null;
      }
      return breadcrumb;
    },
  });
}

/** Errore gestito dall'app ma da conoscere (es. attivazione dell'abbonamento non riuscita). Non blocca mai. */
export function reportError(error: unknown, where: string) {
  if (!SENTRY_DSN) return;
  try {
    Sentry.captureException(error instanceof Error ? error : new Error(String(error)), { tags: { where } });
  } catch {
    // Sentry non deve mai bloccare l'app
  }
}

export const wrapWithSentry = Sentry.wrap;
