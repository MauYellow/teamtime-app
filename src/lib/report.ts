import { createRecord } from '@/lib/airtable';
import { DEVICE } from '@/lib/device';
import { getLog, log } from '@/lib/log';
import { getEmployeeName } from '@/lib/storage';

type AssistenzaFields = { Name?: string; Notes?: string; Device?: string };

/**
 * Invia il log allo sviluppatore come riga della tabella Assistenza (come "Condividi con sviluppatore" di Log Error).
 * Lancia un errore se l'invio non riesce.
 */
export async function sendReportToDeveloper(note?: string) {
  const entries = getLog();
  await createRecord<AssistenzaFields>('Assistenza', {
    Name: getEmployeeName() ?? 'Non registrato',
    Notes: note ? `${note}\n\n${entries.join('\n')}` : entries.join('\n'),
    Device: DEVICE,
  });
  log('Report inviato allo sviluppatore');
}
