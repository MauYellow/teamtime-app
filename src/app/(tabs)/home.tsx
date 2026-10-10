import { router, useFocusEffect } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { useCallback, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AppButton } from '@/components/AppButton';
import { BusyOverlay } from '@/components/BusyOverlay';
import { CompanyRequestBanner } from '@/components/CompanyRequestBanner';
import { LogoHeader } from '@/components/LogoHeader';
import { useQrScanner } from '@/components/QrScanner';
import { confirmAlert } from '@/lib/dialogs';
import { log } from '@/lib/log';
import { showScanResult } from '@/lib/navigation';
import { askReview, shouldAskReview } from '@/lib/review';
import {
  canUseOtherLocale,
  entryMaxRows,
  hasEntryToday,
  registerEntry,
  registerExit,
  SCAN_MESSAGES,
} from '@/lib/scan';
import { clearActivities, getEmployeeLocale, getEmployeeName } from '@/lib/storage';
import { colors, radius, spacing } from '@/theme';

// Home del dipendente (SPEC §4): dati del dipendente e Registra Entrata / Uscita.
// Le ultime attività si vedono in Accesso Dipendenti: qui resta solo un rimando.
export default function HomeScreen() {
  // Valori letti subito (lettura sincrona): altrimenti al primo disegno la Home mostrerebbe per un attimo
  // la versione "non registrato" anche a chi è già registrato.
  const [name, setName] = useState<string | null>(getEmployeeName);
  const [locale, setLocale] = useState<string | null>(getEmployeeLocale);
  const [busy, setBusy] = useState<string | null>(null);
  const { scan, scanner } = useQrScanner();

  const reload = useCallback(() => {
    setName(getEmployeeName());
    setLocale(getEmployeeLocale());
  }, []);

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
      if (hasEntryToday()) {
        log("Riconosciuta un'altra entrata nella giornata di oggi");
        const proceed = await confirmAlert('Attenzione!', "Risulta già un'entrata a tuo nome oggi, vuoi procedere?", {
          cancel: 'No',
          confirm: 'Sì',
        });
        if (!proceed) {
          log('Seconda entrata del giorno annullata');
          showScanResult(SCAN_MESSAGES.entryCancelled);
          return;
        }
        log('Confermata la seconda entrata del giorno');
      }
    } else {
      log(`Locale Scannato diverso dal Locale salvato: ${scanned}`);
      if (!canUseOtherLocale()) {
        log('Intercambio declinato');
        showScanResult(SCAN_MESSAGES.notLinked);
        return;
      }
      log('Intercambio OK');
    }

    setBusy('Riconoscimento account in corso..');
    try {
      const maxRows = await entryMaxRows(scanned, locale);
      if (maxRows === null) {
        log(`Intercambio: ${scanned} non è in Locali Approvati`);
        showScanResult(SCAN_MESSAGES.notLinked);
        return;
      }
      const message = await registerEntry(scanned, maxRows, setBusy);
      showScanResult(message);
    } catch (error) {
      log(`Errore entrata: ${String(error)}`);
      showScanResult(SCAN_MESSAGES.connection);
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
      showScanResult(SCAN_MESSAGES.notLinked);
      return;
    }

    setBusy('QR Code riconosciuto..');
    try {
      const result = await registerExit(scanned, setBusy);
      if (result.kind === 'alreadyOut') {
        setBusy(null);
        Alert.alert('Attenzione!', 'Risulti già uscito da lavoro. Solo il manager può modificare gli orari');
        return;
      }
      if (result.kind === 'noEntry') {
        setBusy(null);
        Alert.alert('Attenzione!', "Non risulta nessuna entrata a tuo nome da chiudere. Registra prima l'entrata.");
        return;
      }
      showScanResult(result.message);
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

  const registerAsEmployee = () => {
    // Come l'originale: un nuovo dipendente parte con le ultime attività vuote.
    clearActivities();
    router.navigate('/accesso');
  };

  if (!name || !locale) {
    return (
      <SafeAreaView style={styles.safe} edges={['top']}>
        <LogoHeader onPress={openLogError} />
        <View style={styles.notRegistered}>
          <CompanyRequestBanner />
          <AppButton title="Registrati come azienda" onPress={() => router.push('/tutorial')} />
          <AppButton title="Registrati come dipendente" onPress={registerAsEmployee} />
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
      </ScrollView>
      {/* Rimando ad Accesso Dipendenti appena sopra la tab bar, con la stessa icona della scheda. */}
      <Pressable
        onPress={() => router.navigate('/accesso')}
        accessibilityRole="link"
        style={({ pressed }) => [styles.hint, pressed && styles.hintPressed]}>
        <SymbolView name={{ ios: 'person.text.rectangle.fill', android: 'badge' }} tintColor={colors.primary} size={22} />
        <Text style={styles.hintText}>
          Ora le tue ultime attività sono in <Text style={styles.hintStrong}>Accesso Dipendenti</Text>
        </Text>
      </Pressable>
      <BusyOverlay text={busy} />
      {scanner}
    </SafeAreaView>
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
  hintText: { flexShrink: 1, color: colors.muted, fontSize: 14, textAlign: 'center' },
  hintStrong: { color: colors.primary, fontWeight: '700' },
});
