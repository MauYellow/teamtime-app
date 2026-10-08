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

/** Nomi delle righe della tabella Versione (colonna Descrizione) usate come variabili. */
export const SETTING_KEYS = {
  version: 'Versione',
  reviewsEnabled: 'Impostazione di recensioni obbligatorie: yes= attivo',
  telegramChannelId: 'Channel Id Telegram',
  telegramBotKey: 'Bot Key Telegram',
} as const;

/** Splash: tentativi e attesa tra un tentativo e l'altro quando Airtable non risponde (come l'originale). */
export const SPLASH_MAX_ATTEMPTS = 5;
export const SPLASH_RETRY_DELAY_MS = 10_000;
/**
 * Per quanto tempo si usano le variabili della tabella Versione salvate sul telefono senza richiederle ad Airtable
 * (SPEC §15.2). Una nuova versione obbligatoria o un cambio delle chiavi Telegram arriva sui telefoni entro questo tempo.
 */
export const CACHE_MAX_AGE_MS = 6 * 60 * 60 * 1000;

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
