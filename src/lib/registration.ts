import { BREVO_API_KEY, WHATSAPP_SUPPORT_URL } from '@/config';
import { formatTime } from '@/lib/activities';
import { createRecord, findFirst, formulaString } from '@/lib/airtable';
import { DEVICE } from '@/lib/device';
import { LOCALI_TABLE } from '@/lib/locali';
import { log } from '@/lib/log';
import { saveSentCompanyRequest, type SentCompanyRequest } from '@/lib/storage';
import { sendTelegram } from '@/lib/telegram';

// Registrazione azienda (SPEC §10): Richiedi QR Code → Quando Contattare → riga in "New QR Code" + contatto Brevo.

const NEW_QR_TABLE = 'New QR Code';
/** Lista Brevo dei nuovi contatti (come l'app Thunkable). */
const BREVO_LIST_ID = 2;

/**
 * Fasce di dipendenti, uguali ai 3 piani del sito (START, TEAMS, BUSINESS). [develop 11/10/2026] Al posto del numero
 * esatto: in "New QR Code" (campo Password, come l'originale) e nel messaggio WhatsApp va il testo della fascia.
 */
export const EMPLOYEE_BANDS = [
  { label: 'da 1 a 5', plan: 'START', maxEmployees: '5' },
  { label: 'da 6 a 11', plan: 'TEAMS', maxEmployees: '11' },
  { label: '12 o più', plan: 'BUSINESS', maxEmployees: '99999' },
] as const;

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

function formatDay(day: Date) {
  return `${day.getDate()}/${day.getMonth() + 1}/${day.getFullYear()}`;
}

/** "G/M/AAAA alle H:mm", come il campo "Quando Contattare" scritto da Thunkable (minuti ora sempre a due cifre). */
export function formatContactTime(day: Date, time: Date) {
  return `${formatDay(day)} alle ${formatTime(time)}`;
}

/**
 * Link WhatsApp all'assistenza; con una richiesta inviata il messaggio è già scritto, così l'azienda deve solo
 * premere Invia.
 */
export function whatsappUrl(request?: SentCompanyRequest | null) {
  if (!request) return WHATSAPP_SUPPORT_URL;
  const text =
    `Buongiorno, ho appena richiesto l'attivazione di TeamTime. Azienda: ${request.locale}, ` +
    `Dipendenti: ${request.employees}. Può contattarmi il ${request.day} alle ${request.time}. Grazie.`;
  return `${WHATSAPP_SUPPORT_URL}?text=${encodeURIComponent(text)}`;
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

/**
 * Crea la richiesta in "New QR Code" (la vede Maurizio per l'attivazione), aggiunge la mail su Brevo e la ricorda sul
 * telefono per l'avviso in Home. Restituisce i dati per il messaggio WhatsApp.
 */
export async function submitRequest(request: CompanyRequest, day: Date, time: Date): Promise<SentCompanyRequest> {
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
  const sent = { locale, employees: request.employees.trim(), day: formatDay(day), time: formatTime(time) };
  saveSentCompanyRequest(sent);
  await addToBrevo(mail);
  return sent;
}
