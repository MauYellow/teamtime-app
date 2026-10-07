import Storage from 'expo-sqlite/kv-store';
import * as SecureStore from 'expo-secure-store';

// Dati salvati sul telefono (equivalente del Local Storage di Thunkable, vedi SPEC §1.3).

const KEYS = {
  name: 'nome', // "Nome Cognome"
  locale: 'locale', // locale di appartenenza (es. teamtime022)
  activities: 'ultimeAttivita', // JSON di Activity[]
  firstAccess: 'primoAccesso', // 'false' dopo la prima apertura di Accesso Dipendenti
  reviewCounter: 'contatoreRecensioni',
} as const;

const SECURE_KEYS = {
  managerLocale: 'accesso_locale',
  managerPassword: 'accesso_password',
} as const;

/** Una timbratura nelle "Ultime attività" del dipendente. */
export type Activity = {
  locale: string;
  /** Data della timbratura (AAAA-MM-GG); null per le righe vecchie non interpretabili. */
  date: string | null;
  type: 'Entrata' | 'Uscita' | null;
  /** Ora "H:mm" come scritta su Airtable. */
  time: string | null;
  /** Testo originale (righe migrate dalla vecchia app). */
  raw?: string;
};

function read(key: string) {
  const value = Storage.getItemSync(key);
  return value === null || value === 'null' ? null : value;
}

export function getEmployeeName() {
  return read(KEYS.name);
}

export function getEmployeeLocale() {
  return read(KEYS.locale);
}

export function isRegistered() {
  return getEmployeeName() !== null && getEmployeeLocale() !== null;
}

export function saveEmployee(name: string, locale: string) {
  Storage.setItemSync(KEYS.name, name);
  Storage.setItemSync(KEYS.locale, locale);
}

/** "Richiedi la rimozione dei tuoi dati": cancella nome e locale (le ultime attività restano, come l'originale). */
export function removeEmployee() {
  Storage.removeItemSync(KEYS.name);
  Storage.removeItemSync(KEYS.locale);
}

export function getActivities(): Activity[] {
  const json = read(KEYS.activities);
  if (!json) return [];
  try {
    const list = JSON.parse(json);
    return Array.isArray(list) ? (list as Activity[]) : [];
  } catch {
    return [];
  }
}

export function saveActivities(activities: Activity[]) {
  Storage.setItemSync(KEYS.activities, JSON.stringify(activities));
}

/** Aggiunge una timbratura in testa alla lista (la più recente è la prima). */
export function addActivity(activity: Activity) {
  saveActivities([activity, ...getActivities()]);
}

export function clearActivities() {
  saveActivities([]);
}

/** True finché il dipendente non ha mai aperto Accesso Dipendenti (la Splash porta al Tutorial). */
export function isFirstAccess() {
  return read(KEYS.firstAccess) !== 'false';
}

export function setFirstAccessDone() {
  Storage.setItemSync(KEYS.firstAccess, 'false');
}

export function getReviewCounter() {
  return Number(read(KEYS.reviewCounter)) || 0;
}

export function setReviewCounter(value: number) {
  Storage.setItemSync(KEYS.reviewCounter, String(value));
}

/** Imposta un valore solo se la chiave è ancora vuota (usato dalla migrazione). */
export function setIfEmpty(key: keyof typeof KEYS, value: string) {
  if (read(KEYS[key]) === null) Storage.setItemSync(KEYS[key], value);
}

// Credenziali del Registro Online ("Ricorda dati"), nel portachiavi del telefono.

export async function getManagerCredentials() {
  const [locale, password] = await Promise.all([
    SecureStore.getItemAsync(SECURE_KEYS.managerLocale),
    SecureStore.getItemAsync(SECURE_KEYS.managerPassword),
  ]);
  return locale && password ? { locale, password } : null;
}

export async function saveManagerCredentials(locale: string, password: string) {
  await SecureStore.setItemAsync(SECURE_KEYS.managerLocale, locale);
  await SecureStore.setItemAsync(SECURE_KEYS.managerPassword, password);
}

export async function clearManagerCredentials() {
  await SecureStore.deleteItemAsync(SECURE_KEYS.managerLocale);
  await SecureStore.deleteItemAsync(SECURE_KEYS.managerPassword);
}
