import { router, useFocusEffect } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AppButton } from '@/components/AppButton';
import { BusyOverlay } from '@/components/BusyOverlay';
import { CompanyTabs, validTab, type CompanyTab } from '@/components/CompanyTabs';
import { LogoHeader } from '@/components/LogoHeader';
import { PresenzaRow } from '@/components/PresenzaRow';
import { SectionHeader } from '@/components/SectionHeader';
import { useQrScanner } from '@/components/QrScanner';
import { formatTime } from '@/lib/activities';
import { confirmAlert, infoAlert } from '@/lib/dialogs';
import {
  companyName,
  currentMonthOf,
  formatEmployeeHours,
  getSavedHistory,
  intercambioActive,
  mergedRecords,
  myCompanies,
  oldestFetch,
  pastMonths,
  pastMonthsAll,
  refreshEmployeeTables,
  type PastMonth,
} from '@/lib/history';
import { hoursOf } from '@/lib/manager';
import { fetchLocaleNames } from '@/lib/locali';
import { log } from '@/lib/log';
import { updateSession } from '@/lib/session';
import {
  getEmployeeLocale,
  getEmployeeName,
  isFirstAccess,
  removeEmployee,
  saveEmployee,
  setFirstAccessDone,
} from '@/lib/storage';
import { colors, radius, spacing } from '@/theme';

/** Spiegazioni dietro le icone "i" di Accesso Dipendenti. */
const HOURS_INFO =
  'Le ore sono in formato decimale, già convertite per i calcoli del totale: 8,50 vuol dire 8 ore e mezza, non 8 ore ' +
  'e 50 minuti.\n\nAltri esempi: 7,25 = 7 ore e 15 minuti; 6,75 = 6 ore e 45 minuti.';
const PAST_MONTHS_INFO =
  'Per i mesi precedenti è visibile solo il totale delle ore. Il dettaglio di entrate e uscite è nel registro del ' +
  'tuo responsabile.';

type Mode = 'new' | 'registered';
type Locale = { locale: string; status: string };

/** Dopo la registrazione o la rimozione dei dati si riparte dalla Splash, che ricarica le info del locale. */
function restartFromSplash() {
  router.replace('/');
}

// Accesso Dipendenti (SPEC §6): registrazione del nuovo dipendente, oppure "Accesso già effettuato".
export default function AccessoScreen() {
  const [mode, setMode] = useState<Mode | null>(null);

  useFocusEffect(
    useCallback(() => {
      log('Accesso Dipendenti: Controllo Primo Accesso');
      if (isFirstAccess() || !getEmployeeName()) {
        log('Accesso Dipendenti: Primo accesso confermato, nessun nome registrato in precedenza');
        setFirstAccessDone();
        setMode('new');
      } else {
        log('Accesso Dipendenti: Nome riconosciuto, non è un primo accesso');
        setMode('registered');
      }
    }, [])
  );

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <LogoHeader variant="icon" />
      {mode === 'new' && <NewEmployee />}
      {mode === 'registered' && <AlreadyRegistered />}
    </SafeAreaView>
  );
}

function NewEmployee() {
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [nameError, setNameError] = useState(false);
  const [step, setStep] = useState<'name' | 'company'>('name');
  const [locali, setLocali] = useState<Locale[] | null>(null);
  const [showList, setShowList] = useState(false);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const { scan, scanner } = useQrScanner();

  const confirmName = () => {
    if (!firstName.trim() || !lastName.trim()) {
      setNameError(true);
      return;
    }
    setNameError(false);
    Keyboard.dismiss();
    setStep('company');
  };

  /** Elenco di Locali Approvati, letto una volta sola. */
  const loadLocali = async () => {
    if (locali) return locali;
    const list = await fetchLocaleNames();
    setLocali(list);
    return list;
  };

  const register = async (locale: string) => {
    const name = `${firstName.trim()} ${lastName.trim()}`;
    saveEmployee(name, locale);
    updateSession({ locale: null });
    log(`Accesso Dipendenti: registrato ${name} su ${locale}`);
    await infoAlert('Complimenti!', 'Registrazione avvenuta con successo. Sarai reindirizzato alla Home.');
    restartFromSplash();
  };

  const scanCompany = async () => {
    const value = await scan();
    if (!value) return;
    setBusy('Verifica del QR Code..');
    try {
      const list = await loadLocali();
      setBusy(null);
      if (list.some((item) => item.locale === value)) {
        await register(value);
      } else {
        log(`Accesso Dipendenti: QR non riconosciuto ${value}`);
        Alert.alert('Attenzione!', 'Il QR Code scannerizzato non appartiene a nessuna azienda');
      }
    } catch (error) {
      setBusy(null);
      log(`Accesso Dipendenti: errore elenco locali ${String(error)}`);
      Alert.alert('Connessione assente', 'Non è stato possibile verificare il QR Code. Riprova fra poco.');
    }
  };

  const openList = async () => {
    setShowList(true);
    setLoading(true);
    try {
      await loadLocali();
    } catch (error) {
      log(`Accesso Dipendenti: errore elenco locali ${String(error)}`);
    } finally {
      setLoading(false);
    }
  };

  const chooseFromList = async (locale: string) => {
    if (await confirmAlert('Conferma azienda', `Confermi "${locale}"?`)) await register(locale);
  };

  // [miglioria] Nell'elenco solo i locali attivi (il QR di un locale non attivo viene comunque riconosciuto).
  const activeLocali = (locali ?? []).filter((item) => item.status === 'Attivo');

  return (
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Text style={styles.stepTitle}>1. Imposta il tuo nome per iniziare</Text>
        <View style={styles.row}>
          <TextInput
            style={[styles.input, step === 'company' && styles.inputDone]}
            placeholder="Nome"
            placeholderTextColor={colors.muted}
            value={firstName}
            onChangeText={setFirstName}
            editable={step === 'name'}
            autoCapitalize="words"
            autoComplete="given-name"
            textContentType="givenName"
            returnKeyType="next"
          />
          <TextInput
            style={[styles.input, step === 'company' && styles.inputDone]}
            placeholder="Cognome"
            placeholderTextColor={colors.muted}
            value={lastName}
            onChangeText={setLastName}
            editable={step === 'name'}
            autoCapitalize="words"
            autoComplete="family-name"
            textContentType="familyName"
            returnKeyType="done"
            onSubmitEditing={confirmName}
          />
        </View>
        <Text style={[styles.stepNote, nameError && styles.error]}>
          {nameError ? 'Inserisci sia il Nome che il Cognome' : 'Assicurati di scrivere Nome e Cognome completi: non potrai cambiarli in seguito'}
        </Text>

        {step === 'name' ? (
          <AppButton title="Continua" onPress={confirmName} style={styles.button} />
        ) : (
          <View style={styles.company}>
            <Pressable onPress={() => setStep('name')} accessibilityRole="button">
              <Text style={styles.link}>Modifica nome</Text>
            </Pressable>
            <Text style={styles.stepTitle}>2. Scegli la tua azienda</Text>
            <AppButton title="Scansiona il QR Code" onPress={scanCompany} style={styles.button} />
            {!showList && (
              <Pressable onPress={openList} accessibilityRole="button">
                <Text style={styles.link}>Vedi elenco completo</Text>
              </Pressable>
            )}
            {showList &&
              (loading ? (
                <ActivityIndicator color={colors.primary} style={styles.loader} />
              ) : locali === null ? (
                <View style={styles.listError}>
                  <Text style={styles.stepNote}>Elenco non disponibile: controlla la connessione.</Text>
                  <AppButton title="Riprova" variant="outline" onPress={openList} />
                </View>
              ) : (
                <View style={styles.list}>
                  {activeLocali.map((item) => (
                    <Pressable
                      key={item.locale}
                      onPress={() => chooseFromList(item.locale)}
                      accessibilityRole="button"
                      style={({ pressed }) => [styles.listItem, pressed && styles.listItemPressed]}>
                      <Text style={styles.listText}>{item.locale}</Text>
                      <Text style={styles.chevron}>›</Text>
                    </Pressable>
                  ))}
                </View>
              ))}
          </View>
        )}
      </ScrollView>
      <BusyOverlay text={busy} />
      {scanner}
    </KeyboardAvoidingView>
  );
}

// Accesso già effettuato: storico e ore lette da Airtable (lib/history.ts). "Azzera Ultime Attività" è stato tolto:
// i dati vengono dal registro online e il dipendente non deve poterli cancellare.
// Con l'Intercambio (SPEC §16.1): schede "Tutte" + una per azienda; in "Tutte" il totale di tutte le aziende con il
// dettaglio per azienda.
function AlreadyRegistered() {
  const locale = getEmployeeLocale();
  const name = getEmployeeName();
  const [tables, setTables] = useState<string[]>(myCompanies);
  const [tab, setTab] = useState<CompanyTab>('all');
  /** Cambia a ogni lettura delle copie: ridisegna la schermata con i dati salvati. */
  const [, setVersion] = useState(0);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);

  /** Rilegge da Airtable solo le copie che servono (timbratura nuova, copia vecchia), oppure tutte trascinando. */
  const load = useCallback(
    async (force: boolean) => {
      if (!locale || !name) return;
      const companies = myCompanies();
      setTables(companies);
      setTab((current) => validTab(current, companies));
      setLoading(true);
      try {
        await refreshEmployeeTables(locale, name, intercambioActive(), force ? 'all' : 'stale');
        setFailed(false);
      } catch (error) {
        log(`Accesso Dipendenti: errore lettura storico ${String(error)}`);
        setFailed(true);
      } finally {
        setLoading(false);
        setTables(myCompanies());
        setVersion((value) => value + 1);
      }
    },
    [locale, name]
  );

  useFocusEffect(
    useCallback(() => {
      load(false);
    }, [load])
  );

  const removeData = async () => {
    log('Accesso Dipendenti: Richiesta Rimozione Dati');
    const confirmed = await confirmAlert(
      'Rimozione dati',
      'Il tuo nome verrà cancellato da questo telefono e dovrai registrarti di nuovo.',
      { confirm: 'Conferma', destructive: true }
    );
    if (!confirmed) return;
    log('Accesso Dipendenti: Richiesta Rimozione Dati - Confermata');
    removeEmployee();
    updateSession({ locale: null });
    await infoAlert('Dati eliminati', 'Eseguito correttamente');
    restartFromSplash();
  };

  const shown = tab === 'all' ? tables : [tab];
  const multi = tables.length > 1;
  const loaded = shown.some((table) => getSavedHistory(table, name) !== null);
  const monthRows = currentMonthOf(mergedRecords(shown, name));
  const monthHours = monthRows.reduce((sum, item) => sum + hoursOf(item.record), 0);
  /** Dettaglio per azienda del mese in corso (solo in "Tutte" con più aziende). */
  const parts =
    tab === 'all' && multi
      ? tables
          .map((table) => ({
            table,
            hours: monthRows.filter((item) => item.table === table).reduce((sum, item) => sum + hoursOf(item.record), 0),
          }))
          .filter((part) => part.hours > 0)
      : [];
  const previous: (PastMonth & { parts?: { table: string; hours: number | null }[] })[] =
    tab === 'all' && multi
      ? pastMonthsAll(tables, name)
      : pastMonths(shown[0] ?? null, name, getSavedHistory(shown[0] ?? null, name)?.records ?? []);
  const monthName = new Date().toLocaleDateString('it-IT', { month: 'long' });
  const monthLabel = `${monthName.charAt(0).toUpperCase()}${monthName.slice(1)}`;
  const fetched = oldestFetch(shown, name);
  const fetchedAt = fetched ? new Date(fetched) : null;
  const status = failed
    ? 'Connessione assente: dati non aggiornati'
    : loading && !loaded
      ? 'Caricamento…'
      : fetchedAt
        ? `Aggiornato il ${fetchedAt.getDate()}/${fetchedAt.getMonth() + 1} alle ${formatTime(fetchedAt)}`
        : 'Non ancora aggiornato';

  return (
    <ScrollView contentContainerStyle={styles.registered}>
      <View style={styles.registeredHeader}>
        <Text style={styles.welcome}>Benvenuto/a {name?.trim().split(/\s+/)[0]}</Text>
        <Text style={styles.paragraph}>
          Per evitare l&apos;utilizzo di più utenti con lo stesso dispositivo non è possibile registrare un altro nome.
          Se necessario, contatta l&apos;assistenza per ricevere supporto.
        </Text>
      </View>

      <CompanyTabs tables={tables} selected={tab} onSelect={setTab} />

      <View style={styles.totalCard}>
        {/* "Ottobre: Ore lavorate (in formato decimale ⓘ)": l'icona spiega le ore decimali. */}
        <View style={styles.totalLabelRow}>
          <Text style={styles.totalLabel}>
            <Text style={styles.bold}>{monthLabel}</Text>
            : Ore lavorate (in formato decimale{' '}
          </Text>
          <Pressable
            onPress={() => Alert.alert('Ore in formato decimale', HOURS_INFO)}
            accessibilityRole="button"
            accessibilityLabel="Informazioni sulle ore in formato decimale"
            hitSlop={12}>
            <SymbolView name={{ ios: 'info.circle', android: 'info' }} tintColor={colors.primary} size={16} />
          </Pressable>
          <Text style={styles.totalLabel}>)</Text>
        </View>
        <Text style={styles.totalValue}>{loaded ? formatEmployeeHours(monthHours) : '—'}</Text>
        {parts.length > 1 &&
          parts.map((part) => (
            <Text key={part.table} style={styles.part}>
              {companyName(part.table)}: {formatEmployeeHours(part.hours)} ore
            </Text>
          ))}
        {/* Aggiornamento manuale: icona che ruota · data e ora dell'ultima lettura. */}
        <Pressable
          onPress={() => load(true)}
          disabled={loading}
          accessibilityRole="button"
          accessibilityLabel="Aggiorna"
          hitSlop={12}
          style={({ pressed }) => [styles.refresh, pressed && styles.refreshPressed]}>
          {loading ? (
            <ActivityIndicator size="small" color={colors.primary} />
          ) : (
            <SymbolView name={{ ios: 'arrow.clockwise', android: 'refresh' }} tintColor={colors.primary} size={18} />
          )}
          <Text style={styles.updated}>·</Text>
          <Text style={styles.updated}>{status}</Text>
        </Pressable>
      </View>

      <Pressable onPress={removeData} accessibilityRole="button">
        <Text style={styles.link}>Richiedi la rimozione dei tuoi dati</Text>
      </Pressable>

      <SectionHeader title="Ultimi accessi" info={HOURS_INFO} />
      {!loaded ? (
        loading ? (
          <ActivityIndicator color={colors.primary} style={styles.loader} />
        ) : (
          <Text style={styles.empty}>Tocca l&apos;icona di aggiornamento per caricare i tuoi accessi</Text>
        )
      ) : monthRows.length > 0 ? (
        monthRows.map(({ table, record }) => (
          <PresenzaRow
            key={`${table}:${record.id}`}
            record={record}
            company={tab === 'all' && multi ? companyName(table) : undefined}
          />
        ))
      ) : (
        <Text style={styles.empty}>Nessuna presenza questo mese</Text>
      )}

      {/* Mesi passati: solo il totale (salvato finché il mese era completo, vedi lib/history.ts). */}
      {previous.length > 0 && (
        <>
          <SectionHeader title="Mesi precedenti" info={PAST_MONTHS_INFO} style={styles.sectionSpacing} />
          {previous.map((month) => (
            <View key={month.key} style={styles.monthRow}>
              <View style={styles.flex}>
                <Text style={styles.monthLabel}>{month.label}</Text>
                {month.parts && month.parts.length > 1 && (
                  <Text style={styles.monthParts}>
                    {month.parts
                      .map(
                        (part) =>
                          `${companyName(part.table)}: ${part.hours === null ? 'n.d.' : formatEmployeeHours(part.hours)}`
                      )
                      .join(' · ')}
                  </Text>
                )}
              </View>
              <Text style={[styles.monthHours, month.hours === null && styles.unavailable]}>
                {month.hours === null ? 'Totale non disponibile' : `${formatEmployeeHours(month.hours)} ore`}
              </Text>
            </View>
          ))}
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  flex: { flex: 1 },
  content: { padding: spacing.lg, gap: spacing.sm, alignItems: 'center' },
  stepTitle: { fontSize: 18, fontWeight: '700', color: colors.text, textAlign: 'center', marginTop: spacing.md },
  stepNote: { fontSize: 14, color: colors.muted, textAlign: 'center' },
  error: { color: colors.error, fontWeight: '600' },
  row: { flexDirection: 'row', gap: spacing.sm, alignSelf: 'stretch', marginTop: spacing.sm },
  input: {
    flex: 1,
    backgroundColor: colors.inputBackground,
    borderRadius: radius.input,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 4,
    fontSize: 16,
    color: colors.text,
  },
  inputDone: { color: colors.muted },
  button: { alignSelf: 'stretch', marginTop: spacing.sm },
  company: { alignSelf: 'stretch', alignItems: 'center', gap: spacing.sm },
  link: {
    color: colors.primary,
    fontSize: 15,
    textAlign: 'center',
    textDecorationLine: 'underline',
    paddingVertical: spacing.sm,
  },
  loader: { marginVertical: spacing.md },
  listError: { alignSelf: 'stretch', gap: spacing.sm },
  list: {
    alignSelf: 'stretch',
    borderRadius: radius.card,
    backgroundColor: colors.surface,
    overflow: 'hidden',
  },
  listItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  listItemPressed: { backgroundColor: colors.border },
  listText: { flex: 1, fontSize: 16, color: colors.text },
  chevron: { fontSize: 22, color: colors.muted },
  registered: { padding: spacing.md, gap: spacing.sm, paddingBottom: spacing.xl },
  registeredHeader: { gap: spacing.sm, marginBottom: spacing.sm },
  paragraph: { fontSize: 15, color: colors.text, textAlign: 'center', lineHeight: 21 },
  totalCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.card,
    padding: spacing.md,
    alignItems: 'center',
    gap: 2,
    marginBottom: spacing.sm,
  },
  totalLabel: { fontSize: 14, color: colors.muted },
  totalLabelRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'center' },
  totalValue: { fontSize: 34, fontWeight: '800', color: colors.primary },
  updated: { fontSize: 12, color: colors.muted },
  refresh: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, marginTop: spacing.xs },
  refreshPressed: { opacity: 0.5 },
  bold: { fontWeight: '700', color: colors.text },
  welcome: { fontSize: 24, fontWeight: '700', color: colors.text, textAlign: 'center' },
  sectionSpacing: { marginTop: spacing.md },
  monthRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.xs,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  monthLabel: { fontSize: 16, fontWeight: '600', color: colors.text },
  monthParts: { fontSize: 12, color: colors.muted, marginTop: 2 },
  part: { fontSize: 13, color: colors.muted },
  monthHours: { fontSize: 15, color: colors.text },
  unavailable: { color: colors.muted, fontStyle: 'italic', fontSize: 13 },
  empty: { textAlign: 'center', color: colors.muted, paddingVertical: spacing.lg },
});
