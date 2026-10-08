import { AIRTABLE_BASE_ID, AIRTABLE_TOKEN } from '@/config';

// Client minimo per la base Airtable "Presenze" (REST API v0).

export type AirtableRecord<T> = { id: string; createdTime: string; fields: T };

type ListResponse<T> = { records: AirtableRecord<T>[]; offset?: string };

export type ListOptions = {
  filterByFormula?: string;
  sort?: { field: string; direction?: 'asc' | 'desc' }[];
  fields?: string[];
  /** Vista da cui leggere (ne segue anche l'ordine delle righe). */
  view?: string;
  pageSize?: number;
  /** Numero massimo di righe da leggere (default: tutte). */
  maxRecords?: number;
};

export class AirtableError extends Error {
  constructor(
    message: string,
    readonly status?: number
  ) {
    super(message);
  }
}

const API = `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}`;

function tableUrl(table: string) {
  return `${API}/${encodeURIComponent(table)}`;
}

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  if (!AIRTABLE_TOKEN) throw new AirtableError('Manca EXPO_PUBLIC_AIRTABLE_TOKEN in .env');
  let response: Response;
  try {
    response = await fetch(url, {
      ...init,
      headers: {
        Authorization: `Bearer ${AIRTABLE_TOKEN}`,
        'Content-Type': 'application/json',
        ...init?.headers,
      },
    });
  } catch (error) {
    throw new AirtableError(`Connessione non riuscita: ${String(error)}`);
  }
  const text = await response.text();
  if (!response.ok) throw new AirtableError(`Airtable HTTP ${response.status}: ${text}`, response.status);
  return JSON.parse(text) as T;
}

/**
 * Testo sicuro da inserire in una formula Airtable tra doppi apici.
 * Esempio: `{Nome} = ${formulaString(nome)}`.
 */
export function formulaString(value: string) {
  return `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
}

/** Legge le righe di una tabella (gestendo la paginazione). */
export async function listRecords<T>(table: string, options: ListOptions = {}): Promise<AirtableRecord<T>[]> {
  const records: AirtableRecord<T>[] = [];
  let offset: string | undefined;
  do {
    const params = new URLSearchParams();
    if (options.filterByFormula) params.set('filterByFormula', options.filterByFormula);
    options.sort?.forEach((sort, index) => {
      params.set(`sort[${index}][field]`, sort.field);
      params.set(`sort[${index}][direction]`, sort.direction ?? 'asc');
    });
    options.fields?.forEach((field) => params.append('fields[]', field));
    if (options.view) params.set('view', options.view);
    if (options.pageSize) params.set('pageSize', String(options.pageSize));
    if (options.maxRecords) params.set('maxRecords', String(options.maxRecords));
    if (offset) params.set('offset', offset);

    const data = await request<ListResponse<T>>(`${tableUrl(table)}?${params.toString()}`);
    records.push(...data.records);
    offset = data.offset;
  } while (offset && (!options.maxRecords || records.length < options.maxRecords));
  return records;
}

/** Prima riga che soddisfa la formula, o null. */
export async function findFirst<T>(table: string, filterByFormula: string): Promise<AirtableRecord<T> | null> {
  const records = await listRecords<T>(table, { filterByFormula, maxRecords: 1 });
  return records[0] ?? null;
}

export function createRecord<T>(table: string, fields: Partial<T>) {
  return request<AirtableRecord<T>>(tableUrl(table), {
    method: 'POST',
    body: JSON.stringify({ fields }),
  });
}

export function updateRecord<T>(table: string, id: string, fields: Partial<T>) {
  return request<AirtableRecord<T>>(`${tableUrl(table)}/${id}`, {
    method: 'PATCH',
    body: JSON.stringify({ fields }),
  });
}

export function deleteRecord(table: string, id: string) {
  return request<{ id: string; deleted: boolean }>(`${tableUrl(table)}/${id}`, { method: 'DELETE' });
}

/** Cancella fino a 10 righe con una sola chiamata (limite dell'API). */
export function deleteRecords(table: string, ids: string[]) {
  const params = new URLSearchParams();
  ids.slice(0, 10).forEach((id) => params.append('records[]', id));
  return request<{ records: { id: string; deleted: boolean }[] }>(`${tableUrl(table)}?${params.toString()}`, {
    method: 'DELETE',
  });
}
