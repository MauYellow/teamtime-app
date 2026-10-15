import { router, useFocusEffect } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { useCallback, useRef, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AppButton } from '@/components/AppButton';
import { BusyOverlay } from '@/components/BusyOverlay';
import { CompanyRequestBanner } from '@/components/CompanyRequestBanner';
import { CompanyTabs, validTab, type CompanyTab } from '@/components/CompanyTabs';
import { LogoHeader } from '@/components/LogoHeader';
import { PresenzaRow } from '@/components/PresenzaRow';
import { useQrScanner } from '@/components/QrScanner';
import { formatTime } from '@/lib/activities';
import { confirmAlert } from '@/lib/dialogs';
import {
  companyName,
  dayLabel,
  entryTodayIn,
  hasMissingCopies,
  intercambioActive,
  localDay,
  mergedRecords,
  myCompanies,
  oldestFetch,
  openShiftElsewhere,
  openShiftTodayElsewhere,
  refreshEmployeeTables,
  today,
  type CompanyPresenza,
  type RefreshMode,
} from '@/lib/history';
import { isAtWork } from '@/lib/manager';
import { log } from '@/lib/log';
import { showScanResult } from '@/lib/navigation';
import { askReview, shouldAskReview } from '@/lib/review';
import {
  canUseOtherLocale,
  friendlyScanMessage,
  isKnownLocale,
  registerEntry,
  recordScanOutcome,
  registerExit,
  SCAN_MESSAGES,
} from '@/lib/scan';
import {
  clearLastScanError,
  closeAccessiHint,
  getEmployeeLocale,
  getEmployeeName,
  getLastScanError,
  isAccessiHintClosed,
  type ScanError,
} from '@/lib/storage';
import { colors, radius, spacing } from '@/theme';

/** Righe di "Ultime Attività" in Home. */
const HOME_ROWS = 5;

// Home del dipendente (SPEC §4): dati del dipendente, Registra Entrata / Uscita, ultime attività e controllo dei turni
// non chiusi. Tutto dalle copie di Airtable (lib/history.ts): nessuna chiamata in più, tranne la prima volta che una
// copia non c'è ancora. Con l'Intercambio: schede "Tutte" + una per azienda e controlli su tutte (SPEC §16.1).
export default function HomeScreen() {
  // Valori letti subito (lettura sincrona): altrimenti al primo disegno la Home mostrerebbe per un attimo
  // la versione "non registrato" anche a chi è già registrato.
  const [name, setName] = useState<string | null>(getEmployeeName);
  const [locale, setLocale] = useState<string | null>(getEmployeeLocale);
  const [tables, setTables] = useState<string[]>(myCompanies);
  const [tab, setTab] = useState<CompanyTab>('all');
  /** Cambia a ogni lettura delle copie: ridisegna la schermata con i dati salvati. */
  const [, setVersion] = useState(0);
  const [historyFailed, setHistoryFailed] = useState(false);
  const [hintClosed, setHintClosed] = useState(isAccessiHintClosed);
  const loadingHistory = useRef(false);
  const [scanError, setScanError] = useState<ScanError | null>(getLastScanError);
  const [busy, setBusy] = useState<string | null>(null);
  const { scan, scanner } = useQrScanner();

  /** Fine timbratura: ricorda l'esito (riga rossa se non riuscita) e apre Scan Result. */
  const finish = (type: ScanError['type'], message: string) => {
    recordScanOutcome(type, message);
    showScanResult(message);
  };

  const dismissScanError = () => {
    clearLastScanError();
    setScanError(null);
  };

  /** Lettura da Airtable (1 chiamata per azienda): copie mancanti, o tutte toccando l'avviso dei turni non chiusi. */
  const loadHistory = useCallback(async (table: string, employee: string, mode: RefreshMode) => {
    if (loadingHistory.current) return;
    loadingHistory.current = true;
    try {
      await refreshEmployeeTables(table, employee, intercambioActive(), mode);
      setHistoryFailed(false);
    } catch (error) {
      log(`Home: copia Airtable non letta ${String(error)}`);
      setHistoryFailed(true);
    } finally {
      loadingHistory.current = false;
      setTables(myCompanies());
      setVersion((value) => value + 1);
    }
  }, []);

  const reload = useCallback(() => {
    const employee = getEmployeeName();
    const table = getEmployeeLocale();
    setName(employee);
    setLocale(table);
    setScanError(getLastScanError());
    const companies = myCompanies();
    setTables(companies);
    setTab((current) => validTab(current, companies));
    setVersion((value) => value + 1);
    // Solo se una copia non c'è ancora (nuovo dipendente, app appena aggiornata, prima timbratura in un'azienda).
    if (table && employee && hasMissingCopies()) loadHistory(table, employee, 'missing');
  }, [loadHistory]);

  // Rilegge i dati ogni volta che la schermata torna visibile (es. dopo Scan Result o Accesso Dipendenti).
  useFocusEffect(reload);

  // Richiesta di recensione al ritorno in Home dopo una timbratura riuscita, se è il momento (vedi lib/review.ts).
  // Qui e non su Scan Result: lì un ritorno veloce in Home annullava la richiesta.
  useFocusEffect(
    useCallback(() => {
      if (!shouldAskReview()) return;
      const timer = setTimeout(askReview, 600);
      return () => clearTimeout(timer);
    }, [])
  );

  const onEntry = async () => {
    if (!locale) return;
    log('Cliccato "Scan Entrata"');
    const scanned = await scan();
    if (!scanned) return;
    log(`Scan Entrata. Valore riconosciuto: ${scanned}`);

    if (scanned === locale) {
      log('Riconosciuto Locale Scannato = Locale di lavoro');
    } else {
      log(`Locale Scannato diverso dal Locale salvato: ${scanned}`);
      if (!canUseOtherLocale()) {
        log('Intercambio declinato');
        finish('Entrata', SCAN_MESSAGES.notLinked);
        return;
      }
      log('Intercambio OK');
    }

    // Controlli sulle copie di tutte le aziende (SPEC §16.1): turno aperto oggi altrove, oppure già un'entrata oggi.
    const companies = myCompanies();
    const openElsewhere = openShiftTodayElsewhere(companies, name, scanned);
    const entryIn = openElsewhere ? null : entryTodayIn(companies, name);
    if (openElsewhere || entryIn) {
      const message = openElsewhere
        ? `Hai un turno aperto in ${companyName(openElsewhere.table)} dalle ${openElsewhere.record.fields.Entrata ?? '—'}. ` +
          `Vuoi registrare comunque l'entrata in ${companyName(scanned)}?`
        : entryIn === scanned
          ? "Risulta già un'entrata a tuo nome oggi, vuoi procedere?"
          : `Risulta già un'entrata a tuo nome oggi in ${companyName(entryIn ?? '')}, vuoi procedere?`;
      log(openElsewhere ? `Turno aperto oggi in ${openElsewhere.table}` : `Riconosciuta un'altra entrata oggi (${entryIn})`);
      const proceed = await confirmAlert('Attenzione!', message, { cancel: 'No', confirm: 'Sì' });
      if (!proceed) {
        log("Entrata annullata dopo l'avviso");
        finish('Entrata', SCAN_MESSAGES.entryCancelled);
        return;
      }
      log("Confermata l'entrata dopo l'avviso");
    }

    setBusy('Riconoscimento account in corso..');
    try {
      if (!(await isKnownLocale(scanned, locale))) {
        log(`Intercambio: ${scanned} non è in Locali Approvati`);
        finish('Entrata', SCAN_MESSAGES.notLinked);
        return;
      }
      const message = await registerEntry(scanned, setBusy);
      finish('Entrata', message);
    } catch (error) {
      log(`Errore entrata: ${String(error)}`);
      finish('Entrata', SCAN_MESSAGES.connection);
    } finally {
      setBusy(null);
    }
  };

  const onExit = async () => {
    if (!locale) return;
    log('Inizializzato Scan Uscita');
    const scanned = await scan();
    if (!scanned) return;
    log(`Riconosciuto locale scannato: ${scanned}`);

    if (scanned !== locale && !canUseOtherLocale()) {
      log('Intercambio declinato in uscita');
      finish('Uscita', SCAN_MESSAGES.notLinked);
      return;
    }

    setBusy('QR Code riconosciuto..');
    try {
      const result = await registerExit(scanned, setBusy);
      if (result.kind === 'tooOld') {
        // Uscita dimenticata in un giorno precedente: non si chiude con l'uscita di oggi (SPEC §15.6 punto 3).
        setBusy(null);
        Alert.alert(
          'Attenzione!',
          `Il tuo ultimo turno aperto è di ${dayLabel(result.record)} alle ${result.record.fields.Entrata ?? '—'}: non ` +
            "può essere chiuso con un'uscita di oggi. Inserisci l'uscita di quel giorno da Gestisci oppure chiedi al tuo " +
            'responsabile.'
        );
        return;
      }
      if (result.kind !== 'done') {
        // Uscita con il QR di un'azienda mentre il turno aperto è in un'altra (SPEC §16.1, §15.6 punto 8): solo avviso.
        const elsewhere = openShiftElsewhere(myCompanies(), name, scanned);
        if (elsewhere) {
          setBusy(null);
          log(`Uscita su ${scanned}, turno aperto in ${elsewhere.table}`);
          const company = companyName(elsewhere.table);
          const pastDay = localDay(elsewhere.record) < today();
          Alert.alert(
            'Attenzione!',
            `Il tuo turno aperto è in ${company} (entrata ${dayLabel(elsewhere.record)} alle ` +
              `${elsewhere.record.fields.Entrata ?? '—'}). Scansiona il QR Code di ${company} per registrare l'uscita` +
              (pastDay ? ', oppure inseriscila da Gestisci.' : '.')
          );
          return;
        }
      }
      if (result.kind === 'alreadyOut') {
        setBusy(null);
        Alert.alert(
          'Attenzione!',
          result.exitToday
            ? `La tua uscita risulta già registrata alle ${result.exitToday}. Solo il manager può modificare gli orari.`
            : 'Risulti già uscito da lavoro. Solo il manager può modificare gli orari'
        );
        return;
      }
      if (result.kind === 'noEntry') {
        setBusy(null);
        Alert.alert('Attenzione!', "Non risulta nessuna entrata a tuo nome da chiudere. Registra prima l'entrata.");
        return;
      }
      finish('Uscita', result.message);
    } catch (error) {
      // Errore imprevisto (SPEC §15.6 punto 12): messaggio e riga rossa in Home, come per l'entrata.
      log(`Errore uscita: ${String(error)}`);
      finish('Uscita', SCAN_MESSAGES.connection);
    } finally {
      setBusy(null);
    }
  };

  const openLogError = async () => {
    const proceed = await confirmAlert(
      'Attenzione!',
      'Proseguendo accederai alla schermata di risoluzione problemi',
      { confirm: 'Prosegui' }
    );
    if (proceed) router.push('/log-error');
  };

  /** Avviso rosso: rilegge Airtable (il manager potrebbe averli già chiusi) e apre Gestisci per inserire le uscite. */
  const checkOpenShifts = async () => {
    if (!locale || !name) return;
    setBusy('Aggiornamento dei tuoi accessi..');
    await loadHistory(locale, name, 'all');
    setBusy(null);
    router.navigate('/gestisci');
  };

  const allRows = mergedRecords(tables, name);
  const rows = tab === 'all' ? allRows : allRows.filter((item) => item.table === tab);
  const showCompany = tab === 'all' && tables.length > 1;
  /** Copia del proprio locale già letta (le altre aziende si aggiungono quando arrivano). */
  const loaded = oldestFetch([locale ?? ''], name) !== null || allRows.length > 0;

  if (!name || !locale) {
    return (
      <SafeAreaView style={styles.safe} edges={['top']}>
        <LogoHeader onPress={openLogError} />
        <View style={styles.notRegistered}>
          <CompanyRequestBanner />
          <AppButton title="Registrati come azienda" onPress={() => router.push('/tutorial')} />
          <AppButton title="Registrati come dipendente" onPress={() => router.navigate('/accesso')} />
          <AppButton title="Accedi al Tutorial" variant="outline" onPress={() => router.push('/tutorial')} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <LogoHeader onPress={openLogError} />
      <ScrollView contentContainerStyle={styles.content}>
        <CompanyRequestBanner />
        <View style={styles.card}>
          <Text style={styles.label}>Nome Dipendente</Text>
          <Text style={styles.value}>{name}</Text>
          <Text style={styles.label}>Azienda</Text>
          <Text style={styles.value}>{locale}</Text>
        </View>
        <View style={styles.buttons}>
          <AppButton title="Registra Entrata" onPress={onEntry} disabled={busy !== null} style={styles.flex} />
          {/* Sempre attivo: alla scansione l'app controlla su Airtable se il dipendente è già uscito. */}
          <AppButton title="Registra Uscita" onPress={onExit} disabled={busy !== null} style={styles.flex} />
        </View>
        {scanError && <ScanErrorNotice error={scanError} onDismiss={dismissScanError} />}
        <Text style={styles.sectionTitle}>Ultime Attività</Text>
        <CompanyTabs tables={tables} selected={tab} onSelect={setTab} />
        {loaded ? (
          rows.length > 0 ? (
            <View>
              {rows.slice(0, HOME_ROWS).map(({ table, record }) => (
                <PresenzaRow
                  key={`${table}:${record.id}`}
                  record={record}
                  company={showCompany ? companyName(table) : undefined}
                />
              ))}
            </View>
          ) : (
            <Text style={styles.empty}>Ancora nessuna attività</Text>
          )
        ) : (
          <Text style={styles.empty}>
            {historyFailed ? 'Attività non disponibili: controlla la connessione' : 'Caricamento…'}
          </Text>
        )}
      </ScrollView>
      {loaded && (
        <ShiftsCheck
          all={allRows}
          fetchedAt={oldestFetch(tables, name)}
          withCompany={tables.length > 1}
          onPress={checkOpenShifts}
        />
      )}
      {/* Rimando ad Accessi appena sopra la tab bar, con la stessa icona della scheda. Con la X non si vede più. */}
      {!hintClosed && (
        <View style={styles.hintWrap}>
          <Pressable
            onPress={() => router.navigate('/accesso')}
            accessibilityRole="link"
            style={({ pressed }) => [styles.hint, styles.hintWithClose, pressed && styles.hintPressed]}>
            <SymbolView name={{ ios: 'person.text.rectangle.fill', android: 'badge' }} tintColor={colors.primary} size={22} />
            <Text style={styles.hintText}>
              Ora puoi vedere il conteggio mensile delle tue ore in <Text style={styles.hintStrong}>Accessi</Text>
            </Text>
          </Pressable>
          <Pressable
            onPress={() => {
              closeAccessiHint();
              setHintClosed(true);
            }}
            accessibilityRole="button"
            accessibilityLabel="Chiudi avviso"
            hitSlop={12}
            style={styles.hintClose}>
            <SymbolView name={{ ios: 'xmark', android: 'close' }} tintColor={colors.muted} size={16} />
          </Pressable>
        </View>
      )}
      <BusyOverlay text={busy} />
      {scanner}
    </SafeAreaView>
  );
}

/** Ultima timbratura non riuscita, con il motivo: resta finché la successiva riesce o il dipendente la chiude. */
function ScanErrorNotice({ error, onDismiss }: { error: ScanError; onDismiss: () => void }) {
  const at = new Date(error.at);
  const when = Number.isNaN(at.getTime()) ? '' : ` il ${at.getDate()}/${at.getMonth() + 1} alle ${formatTime(at)}`;
  return (
    <View style={[styles.notice, styles.hintAlert]} accessibilityRole="alert">
      <SymbolView
        name={{ ios: 'exclamationmark.triangle.fill', android: 'warning' }}
        tintColor={colors.error}
        size={22}
      />
      <View style={styles.flexShrink}>
        <Text style={styles.alertText}>
          {error.type} non registrata{when}
        </Text>
        <Text style={styles.noticeText}>{friendlyScanMessage(error.message)}</Text>
      </View>
      <Pressable onPress={onDismiss} accessibilityRole="button" accessibilityLabel="Chiudi avviso" hitSlop={12}>
        <SymbolView name={{ ios: 'xmark', android: 'close' }} tintColor={colors.muted} size={16} />
      </Pressable>
    </View>
  );
}

/**
 * Controllo dei turni lasciati "al lavoro" nei giorni precedenti, in tutte le aziende: verde se tutto è a posto,
 * rosso se no.
 */
function ShiftsCheck({
  all,
  fetchedAt,
  withCompany,
  onPress,
}: {
  all: CompanyPresenza[];
  fetchedAt: number | null;
  withCompany: boolean;
  onPress: () => void;
}) {
  const day = today();
  const open = all.filter((item) => isAtWork(item.record) && localDay(item.record) < day);
  if (open.length === 0) {
    return (
      <View style={styles.hint}>
        <SymbolView name={{ ios: 'checkmark.circle.fill', android: 'check_circle' }} tintColor={colors.success} size={22} />
        <Text style={styles.hintText}>Nessun turno lasciato aperto</Text>
      </View>
    );
  }
  const days =
    open
      .slice(0, 3)
      .map((item) => dayLabel(item.record) + (withCompany ? ` (${companyName(item.table)})` : ''))
      .join(', ') + (open.length > 3 ? '…' : '');
  const text = open.length === 1 ? `Hai 1 turno non chiuso: ${days}` : `Hai ${open.length} turni non chiusi: ${days}`;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityHint="Aggiorna i dati e apre Gestisci"
      style={({ pressed }) => [styles.hint, styles.hintAlert, pressed && styles.hintPressed]}>
      <SymbolView name={{ ios: 'xmark.circle.fill', android: 'cancel' }} tintColor={colors.error} size={22} />
      <View style={styles.flexShrink}>
        <Text style={[styles.hintText, styles.alertText]}>{text}</Text>
        <Text style={styles.updated}>
          {fetchedAt ? `Aggiornato alle ${formatTime(new Date(fetchedAt))} · ` : ''}tocca per aggiornare
        </Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  notRegistered: { flex: 1, justifyContent: 'center', padding: spacing.lg, gap: spacing.md },
  content: { padding: spacing.md, paddingBottom: spacing.xl, gap: spacing.md },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.card,
    padding: spacing.md,
    alignItems: 'center',
    gap: 2,
  },
  label: { fontSize: 13, color: colors.muted, marginTop: spacing.xs },
  value: { fontSize: 20, fontWeight: '700', color: colors.text, textAlign: 'center' },
  buttons: { flexDirection: 'row', gap: spacing.sm },
  flex: { flex: 1 },
  flexShrink: { flexShrink: 1 },
  sectionTitle: { marginTop: spacing.sm, fontSize: 20, fontWeight: '700', color: colors.text, textAlign: 'center' },
  empty: { textAlign: 'center', color: colors.muted, paddingVertical: spacing.md },
  hint: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    marginHorizontal: spacing.md,
    marginBottom: spacing.sm,
    padding: spacing.sm,
    borderRadius: radius.card,
    backgroundColor: colors.surface,
  },
  hintPressed: { opacity: 0.6 },
  hintWrap: { justifyContent: 'center' },
  hintWithClose: { paddingRight: spacing.xl },
  hintClose: { position: 'absolute', right: spacing.md + spacing.sm, top: 0, bottom: spacing.sm, justifyContent: 'center' },
  hintAlert: { backgroundColor: '#FDECEE' },
  notice: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, padding: spacing.sm + 2, borderRadius: radius.card },
  noticeText: { fontSize: 13, color: colors.text },
  hintText: { flexShrink: 1, color: colors.muted, fontSize: 14, textAlign: 'center' },
  hintStrong: { color: colors.primary, fontWeight: '700' },
  alertText: { color: colors.error, fontWeight: '600' },
  updated: { fontSize: 11, color: colors.muted, textAlign: 'center' },
});
