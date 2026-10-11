import type { LocaleFields } from '@/lib/locali';

// Impostazioni del locale: colonna "Impostazioni" (prima "Preferenze") di Locali Approvati, testo JSON (SPEC §16).
// Le chiavi mancanti o non valide prendono il valore predefinito. Le modifica il manager dall'area manager
// (scheda Impostazioni). Esempio:
// {"correzioneUscite": true, "giorniCorrezione": 7, "oreMaxTurno": 16, "richieste": true}

export type LocalePreferences = {
  /** Il dipendente può inserire da solo l'uscita dei turni dimenticati "al lavoro". */
  correzioneUscite: boolean;
  /** Turni correggibili: quelli degli ultimi N giorni. */
  giorniCorrezione: number;
  /** Durata massima di un turno corretto dal dipendente (ore). */
  oreMaxTurno: number;
  /** Il dipendente può inviare richieste di ferie e permessi (funzione in arrivo). */
  richieste: boolean;
};

/**
 * Valori predefiniti quando la colonna è vuota. Per decisione dell'utente (11/10/2026) per ora le funzioni sono
 * attive: DA RIVEDERE prima della pubblicazione, insieme al pannello Impostazioni del manager.
 */
export const DEFAULT_PREFERENCES: LocalePreferences = {
  correzioneUscite: true,
  giorniCorrezione: 7,
  oreMaxTurno: 16,
  richieste: true,
};

export function localePreferences(locale: LocaleFields | null): LocalePreferences {
  let raw: Record<string, unknown> = {};
  try {
    const parsed = JSON.parse(locale?.Impostazioni || '{}');
    if (parsed && typeof parsed === 'object') raw = parsed as Record<string, unknown>;
  } catch {
    // JSON non valido: valori predefiniti
  }
  const bool = (key: keyof LocalePreferences) =>
    typeof raw[key] === 'boolean' ? (raw[key] as boolean) : (DEFAULT_PREFERENCES[key] as boolean);
  const positive = (key: keyof LocalePreferences, max: number) => {
    const value = Number(raw[key]);
    return Number.isFinite(value) && value > 0 && value <= max ? value : (DEFAULT_PREFERENCES[key] as number);
  };
  return {
    correzioneUscite: bool('correzioneUscite'),
    giorniCorrezione: positive('giorniCorrezione', 365),
    oreMaxTurno: positive('oreMaxTurno', 24),
    richieste: bool('richieste'),
  };
}
