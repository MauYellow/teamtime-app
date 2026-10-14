import { PROXY_URL } from '@/config';
import { reportError } from '@/lib/sentry';

// Chiamate al proxy TeamTime (SPEC §18): l'app non parla più direttamente con Airtable, Telegram, Brevo e geocode e non
// contiene nessuna chiave. Ogni operazione è un POST con corpo JSON; gli errori arrivano come { error: "codice" }.

/** Senza risposta entro questo tempo la chiamata si considera fallita (connessione scarsa). */
const TIMEOUT_MS = 30_000;

export class ApiError extends Error {
  constructor(
    message: string,
    /** Codice HTTP; 0 = nessuna risposta (telefono offline, server irraggiungibile). */
    readonly status: number,
    /** Codice breve del proxy (es. "not_found", "mail_exists", "connection"). */
    readonly code: string
  ) {
    super(message);
  }
}

export async function api<T>(path: string, body: object = {}): Promise<T> {
  if (!PROXY_URL) throw new ApiError('Manca EXPO_PUBLIC_PROXY_URL in .env', 0, 'config');
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  let response: Response;
  let text: string;
  try {
    response = await fetch(`${PROXY_URL}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    text = await response.text();
  } catch (error) {
    throw new ApiError(`Connessione non riuscita: ${String(error)}`, 0, 'connection');
  } finally {
    clearTimeout(timer);
  }
  let data: Record<string, unknown> = {};
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    // risposta non JSON (es. pagina di errore del servizio)
  }
  if (!response.ok) {
    const code = String(data.error ?? 'http');
    const detail = `${path} HTTP ${response.status} ${code}${data.type ? ` ${String(data.type)}` : ''}`;
    // A Sentry solo percorso e codice, mai dati. Gli esiti previsti (sessione scaduta, mail già usata...) no.
    if (response.status >= 500 || response.status === 400) reportError(new Error(`Proxy ${detail}`), 'proxy');
    throw new ApiError(`Proxy ${detail}`, response.status, code);
  }
  return data as T;
}
