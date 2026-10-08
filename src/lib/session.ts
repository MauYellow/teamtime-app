import { useSyncExternalStore } from 'react';

import type { LocaleFields } from '@/lib/locali';
import type { AppSettings } from '@/lib/settings';

// Stato in memoria condiviso tra le schermate (equivalente delle "app variable" di Thunkable).

export type Session = {
  /** Impostazioni lette dal foglio Google della nuova app. */
  settings: AppSettings | null;
  /** Record di Locali Approvati del locale del dipendente ("Row Object Locale"). */
  locale: LocaleFields | null;
  /** Locale del manager dopo il login nel Registro Online (null = area manager chiusa). */
  manager: LocaleFields | null;
};

let state: Session = { settings: null, locale: null, manager: null };
const listeners = new Set<() => void>();

export function getSession() {
  return state;
}

export function updateSession(patch: Partial<Session>) {
  state = { ...state, ...patch };
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useSession() {
  return useSyncExternalStore(subscribe, getSession);
}
