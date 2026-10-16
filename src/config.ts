// Configurazione centrale dell'app.

import Constants from 'expo-constants';

/**
 * Versione installata, presa da "version" di app.json (UNICO posto dove si scrive, formato a tre numeri: 4.0.1 per le
 * correzioni, 4.1.0 per le novità; SPEC §15.4, 16/10/2026). La Splash la confronta con la riga "Versione" del foglio
 * impostazioni (versione minima accettata): se il foglio è più recente, blocca con "Aggiorna". Alzare la riga del foglio
 * solo DOPO che la nuova versione è disponibile su entrambi gli store.
 */
export const APP_VERSION: string = Constants.expoConfig?.version ?? '0.0.0';

/**
 * Proxy TeamTime (SPEC §18): tutte le operazioni su Airtable, Telegram, Brevo e geocode passano dal server, che tiene
 * le chiavi. L'app non contiene più nessuna chiave privata. Sta in .env (in locale l'IP del PC, es. http://192.168.1.10:8000).
 */
export const PROXY_URL = (process.env.EXPO_PUBLIC_PROXY_URL ?? '').replace(/\/+$/, '');

/** Chiavi pubbliche RevenueCat (abbonamento in-app, SPEC §17). Stanno in .env; se mancano, l'abbonamento è spento. */
export const REVENUECAT_IOS_KEY = process.env.EXPO_PUBLIC_REVENUECAT_IOS_KEY ?? '';
export const REVENUECAT_ANDROID_KEY = process.env.EXPO_PUBLIC_REVENUECAT_ANDROID_KEY ?? '';

/** Sentry (errori e crash, regione UE). Sta in .env; se manca, Sentry è spento. */
export const SENTRY_DSN = process.env.EXPO_PUBLIC_SENTRY_DSN ?? '';

/**
 * Impostazioni della nuova app: scheda del file "TeamTime - App Settings" PUBBLICATA SUL WEB in formato CSV
 * (File → Condividi → Pubblica sul web → solo quella scheda → CSV). Colonna A = nome, colonna B = valore; riga
 * "Versione" (la riga "Recensioni" non è più usata). Il file resta privato: le chiavi nelle altre schede non diventano pubbliche.
 * La scheda della vecchia app Thunkable resta com'è (SPEC §1.2 e §15.1). Vuoto = controllo versione disattivato.
 */
export const SETTINGS_CSV_URL =
  'https://docs.google.com/spreadsheets/d/e/2PACX-1vTMrLJRGThz5emH7D0Awd_fIo3sU0VJyRfdyIcaksrSpx8J8d233A-qxF1k3y7iw4A_tv0g1pIf8qS-/pub?gid=1859409346&single=true&output=csv';
/** Nomi delle righe del foglio impostazioni (colonna A). */
export const SETTING_KEYS = { version: 'Versione' } as const;

/** Ogni quante scansioni riuscite (entrate + uscite) si chiede una recensione. Per provarla si può abbassare. */
export const REVIEW_EVERY_SCANS = 20;
/** Ogni quanti accessi riusciti al Registro Online si chiede una recensione (titolari che non timbrano). */
export const REVIEW_EVERY_MANAGER_LOGINS = 10;

/** Splash: tentativi e attesa tra un tentativo e l'altro quando Airtable non risponde (come l'originale). */
export const SPLASH_MAX_ATTEMPTS = 5;
export const SPLASH_RETRY_DELAY_MS = 10_000;

/** Durata minima della Splash (ms). */
export const SPLASH_MIN_DURATION_MS = 1500;

/**
 * Identificativi dell'app pubblicata sugli store (dai link della tabella Supporto).
 * Prima della pubblicazione vanno messi anche in app.json (ios.bundleIdentifier e android.package).
 */
export const ANDROID_PACKAGE = 'com.gmail.mauriziopolverini89.teamtime';
export const IOS_APP_STORE_ID = '6443974498';

/** Assistenza WhatsApp (schermata Conferma e Assistenza). */
export const WHATSAPP_SUPPORT_URL = 'https://wa.me/393931367530';

/** Modulo di assistenza (lo stesso della voce "Assistenza" in Supporto): "Segnala un problema". */
export const ASSISTANCE_FORM_URL = 'https://airtable.com/shr0Bdu0Ye9GXvbqq';

/** "Vuoi far rimuovere i tuoi dati aziendali? Contattaci" (Registro Online): modulo Airtable. */
export const DATA_REMOVAL_FORM_URL = 'https://airtable.com/appOwBv51ihqoT7Cx/shr0Bdu0Ye9GXvbqq';

/** Area manager → "Il tuo piano": link legali e gestionale web. */
export const PRIVACY_URL = 'https://www.teamtimeapp.it/privacy';
/** Termini e condizioni (EULA) di TeamTime, per iOS e Android. */
export const EULA_URL = 'https://www.teamtimeapp.it/termini';
export const PORTAL_URL = 'https://www.teamtimeapp.it/login';
