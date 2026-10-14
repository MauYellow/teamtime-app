import { api } from '@/lib/api';
import { writeCache } from '@/lib/cache';
import { localeCacheKey, type LocaleFields } from '@/lib/locali';
import { log } from '@/lib/log';
import { getSession, updateSession } from '@/lib/session';

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
 * Valori predefiniti quando la colonna è vuota: tutte le funzioni attive, 7 giorni, 16 ore (confermati dall'utente il
 * 12/10/2026 come standard per tutti i locali).
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

/**
 * All'ingresso del manager: se la colonna "Impostazioni" del suo locale è vuota, ci scrive i valori predefiniti
 * (12/10/2026), tramite il proxy con il gettone del manager. Così su Airtable si vede cosa vale per quel locale. Un errore
 * qui non blocca niente: l'app usa comunque i predefiniti.
 */
export async function ensureDefaultPreferences(locale: string) {
  try {
    const result = await api<{ changed: boolean; locale: LocaleFields }>('/manager/ensure-defaults', {
      token: getSession().managerToken ?? '',
    });
    if (!result.changed) return;
    const session = getSession();
    if (session.manager?.Locale !== locale) return;
    updateSession(
      session.locale?.Locale === locale ? { manager: result.locale, locale: result.locale } : { manager: result.locale }
    );
    writeCache(localeCacheKey(locale), result.locale);
    log(`Impostazioni predefinite salvate per ${locale}`);
  } catch (error) {
    log(`Impostazioni predefinite non salvate per ${locale}: ${String(error)}`);
  }
}
