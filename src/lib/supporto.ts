import { Platform } from 'react-native';

import { listRecords } from '@/lib/airtable';

// Tabella "Supporto": voci della schermata Supporto (SPEC §9).

type SupportoFields = {
  Titolo?: string;
  Sottotitolo?: string;
  Immagine?: string;
  'URL Apple'?: string;
  'URL Android'?: string;
};

export type SupportItem = { id: string; title: string; subtitle: string; image: string | null; url: string | null };

export async function fetchSupportItems(): Promise<SupportItem[]> {
  // Stesso ordine della vista della tabella (come la Data Viewer List di Thunkable).
  const records = await listRecords<SupportoFields>('Supporto', { view: 'Grid view' });
  return records
    .filter((record) => record.fields.Titolo?.trim())
    .map((record) => ({
      id: record.id,
      title: record.fields.Titolo?.trim() ?? '',
      subtitle: record.fields.Sottotitolo?.trim() ?? '',
      image: record.fields.Immagine?.trim() || null,
      url: (Platform.OS === 'ios' ? record.fields['URL Apple'] : record.fields['URL Android'])?.trim() || null,
    }));
}
