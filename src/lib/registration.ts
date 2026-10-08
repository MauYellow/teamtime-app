import { BREVO_API_KEY } from '@/config';
import { createRecord, findFirst, formulaString } from '@/lib/airtable';
import { DEVICE } from '@/lib/device';
import { LOCALI_TABLE } from '@/lib/locali';
import { log } from '@/lib/log';
import { sendTelegram } from '@/lib/telegram';

// Registrazione azienda (SPEC §10): Richiedi QR Code → Quando Contattare → riga in "New QR Code" + contatto Brevo.

const NEW_QR_TABLE = 'New QR Code';
/** Lista Brevo dei nuovi contatti (come l'app Thunkable). */
const BREVO_LIST_ID = 2;

export type CompanyRequest = {
  locale: string;
  mail: string;
  phone: string;
  employees: string;
};

type NewQrFields = {
  Locale?: string;
  Mail?: string;
  QRCode?: string;
  Password?: string;
  Telefono?: string;
  'Quando Contattare'?: string;
  Device?: string;
};

/**
 * Controlli del modulo "Richiedi QR Code", con gli stessi messaggi dell'originale.
 * Restituisce il messaggio di errore oppure null se si può proseguire.
 */
export async function validateRequest(request: CompanyRequest): Promise<string | null> {
  const locale = request.locale.trim();
  const mail = request.mail.trim();
  if (!locale || !mail.includes('@') || !request.phone.trim() || !request.employees.trim()) {
    return 'Compila tutti i campi correttamente';
  }
  if (/\s/.test(locale)) return "Non sono ammessi spazi nel nome dell'azienda";
  // Nome = contenuto del QR = nome della tabella: deve essere unico (confronto sensibile alle maiuscole, come Thunkable).
  if (await findFirst(NEW_QR_TABLE, `{Locale} = ${formulaString(locale)}`)) {
    return 'Questo nome azienda è già utilizzato, prova con un altro';
  }
  if (await findFirst(LOCALI_TABLE, `{Locale} = ${formulaString(locale)}`)) {
    return "Azienda già registrata e convalidata. Per assistenza contattaci dalla sezione Supporto dell'app";
  }
  return null;
}

/** "G/M/AAAA alle H:mm", come il campo "Quando Contattare" scritto da Thunkable (minuti ora sempre a due cifre). */
export function formatContactTime(day: Date, time: Date) {
  const minutes = String(time.getMinutes()).padStart(2, '0');
  return `${day.getDate()}/${day.getMonth() + 1}/${day.getFullYear()} alle ${time.getHours()}:${minutes}`;
}

/** Aggiunge il contatto alla lista Brevo. Un errore qui non blocca la registrazione. */
async function addToBrevo(mail: string) {
  if (!BREVO_API_KEY) {
    log('Brevo: chiave assente, contatto non aggiunto');
    return;
  }
  try {
    const response = await fetch('https://api.brevo.com/v3/contacts', {
      method: 'POST',
      headers: { 'api-key': BREVO_API_KEY, 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ email: mail, listIds: [BREVO_LIST_ID] }),
    });
    const text = await response.text();
    log(`Brevo: HTTP ${response.status}`);
    sendTelegram(`Aggiunto nuovo contatto in Brevo: ${text || response.status}`);
  } catch (error) {
    log(`Brevo: errore ${String(error)}`);
  }
}

/** Crea la richiesta in "New QR Code" (la vede Maurizio per l'attivazione) e aggiunge la mail su Brevo. */
export async function submitRequest(request: CompanyRequest, day: Date, time: Date) {
  const locale = request.locale.trim();
  const mail = request.mail.trim().toLowerCase();
  const fields: NewQrFields = {
    Locale: locale,
    Mail: mail,
    QRCode: `https://quickchart.io/qr?text=${locale}`,
    // Come l'originale: nel campo Password della richiesta va il numero di dipendenti.
    Password: request.employees.trim(),
    Telefono: request.phone.trim(),
    'Quando Contattare': formatContactTime(day, time),
    Device: DEVICE,
  };
  await createRecord<NewQrFields>(NEW_QR_TABLE, fields);
  log(`Richiesta QR Code creata: ${locale}`);
  sendTelegram(`*Nuova richiesta QR Code*: ${locale} *Quando contattare*: ${fields['Quando Contattare']}`);
  await addToBrevo(mail);
}
