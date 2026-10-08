// Configurazione centrale dell'app.

/**
 * Versione installata, confrontata con la riga "Versione" della tabella Versione su Airtable
 * (oggi 2.98; l'app Thunkable mostrava 3.0001). Se su Airtable c'è un numero maggiore, la Splash blocca.
 * Alzare la riga su Airtable solo DOPO che la nuova versione è sugli store.
 */
export const APP_VERSION = 4.0;

/** Base Airtable "Presenze" (condivisa con il portale web). */
export const AIRTABLE_BASE_ID = 'appOwBv51ihqoT7Cx';
/** Token Airtable (lettura e scrittura sulla base Presenze). Sta in .env, mai nel codice. */
export const AIRTABLE_TOKEN = process.env.EXPO_PUBLIC_AIRTABLE_TOKEN ?? '';

/** Chiave di geocode.maps.co (indirizzo dalla posizione GPS). Sta in .env. */
export const GEOCODE_API_KEY = process.env.EXPO_PUBLIC_GEOCODE_API_KEY ?? '';

/** Log su Telegram (canale dello sviluppatore). Stanno in .env; se mancano, i log Telegram non partono. */
export const TELEGRAM_BOT_KEY = process.env.EXPO_PUBLIC_TELEGRAM_BOT_KEY ?? '';
export const TELEGRAM_CHANNEL_ID = process.env.EXPO_PUBLIC_TELEGRAM_CHANNEL_ID ?? '';

/**
 * Impostazioni della nuova app: scheda del file "TeamTime - App Settings" PUBBLICATA SUL WEB in formato CSV
 * (File → Condividi → Pubblica sul web → solo quella scheda → CSV). Colonna A = nome, colonna B = valore; righe
 * "Versione" e "Recensioni" (yes/no). Il file resta privato: le chiavi nelle altre schede non diventano pubbliche.
 * La scheda della vecchia app Thunkable resta com'è (SPEC §1.2 e §15.1). Vuoto = controllo versione disattivato.
 */
export const SETTINGS_CSV_URL = '';
/** Nomi delle righe del foglio impostazioni (colonna A). */
export const SETTING_KEYS = { version: 'Versione', reviewsEnabled: 'Recensioni' } as const;

/** Splash: tentativi e attesa tra un tentativo e l'altro quando Airtable non risponde (come l'originale). */
export const SPLASH_MAX_ATTEMPTS = 5;
export const SPLASH_RETRY_DELAY_MS = 10_000;

/** Durata minima della Splash (ms). */
export const SPLASH_MIN_DURATION_MS = 1500;

/**
 * Identificativi sugli store: DA SOSTITUIRE con quelli reali prima della pubblicazione
 * (insieme a ios.bundleIdentifier e android.package in app.json).
 */
export const ANDROID_PACKAGE = 'com.teamtime.dasostituire';
export const IOS_APP_STORE_ID = '';

/** Assistenza WhatsApp (schermata Conferma e Assistenza). */
export const WHATSAPP_SUPPORT_URL = 'https://wa.me/393931367530';
