import { api } from '@/lib/api';
import { DEVICE } from '@/lib/device';
import { getLog, log } from '@/lib/log';
import { getEmployeeName } from '@/lib/storage';

/**
 * Invia il log allo sviluppatore come riga della tabella Assistenza (come "Condividi con sviluppatore" di Log Error).
 * Lancia un errore se l'invio non riesce.
 */
export async function sendReportToDeveloper(note?: string) {
  const entries = getLog();
  await api('/assistenza', {
    Name: getEmployeeName() ?? 'Non registrato',
    Notes: note ? `${note}\n\n${entries.join('\n')}` : entries.join('\n'),
    Device: DEVICE,
  });
  log('Report inviato allo sviluppatore');
}
