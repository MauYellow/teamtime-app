import { SETTING_KEYS } from '@/config';
import { listRecords } from '@/lib/airtable';

// Variabili d'ambiente dalla tabella "Versione" (Descrizione = nome, Versione = valore). Vedi SPEC §1.2.

export type AppSettings = {
  /** Ultima versione pubblicata (null se la riga manca: il controllo viene saltato). */
  latestVersion: number | null;
  reviewsEnabled: boolean;
  telegramChannelId: string | null;
  telegramBotKey: string | null;
};

type VersionRow = { Versione?: string; Descrizione?: string };

export async function fetchAppSettings(): Promise<AppSettings> {
  const rows = await listRecords<VersionRow>('Versione');
  const value = (name: string) =>
    rows.find((row) => row.fields.Descrizione?.trim() === name)?.fields.Versione?.trim() || null;

  const version = Number(String(value(SETTING_KEYS.version) ?? '').replace(',', '.'));
  return {
    latestVersion: Number.isFinite(version) && version > 0 ? version : null,
    reviewsEnabled: value(SETTING_KEYS.reviewsEnabled)?.toLowerCase() === 'yes',
    telegramChannelId: value(SETTING_KEYS.telegramChannelId),
    telegramBotKey: value(SETTING_KEYS.telegramBotKey),
  };
}
