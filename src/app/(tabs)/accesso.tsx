import { router, useFocusEffect } from 'expo-router';
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
import { BrandTitle } from '@/components/BrandTitle';
import { BusyOverlay } from '@/components/BusyOverlay';
import { LogoHeader } from '@/components/LogoHeader';
import { useQrScanner } from '@/components/QrScanner';
import { activityLabel } from '@/lib/activities';
import { confirmAlert, infoAlert } from '@/lib/dialogs';
import { fetchLocaleNames } from '@/lib/locali';
import { log } from '@/lib/log';
import { updateSession } from '@/lib/session';
import {
  clearActivities,
  getActivities,
  getEmployeeName,
  isFirstAccess,
  removeEmployee,
  saveEmployee,
  setFirstAccessDone,
  type Activity,
} from '@/lib/storage';
import { colors, radius, spacing } from '@/theme';

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

  const companyNotListed = async () => {
    const goRegister = await confirmAlert(
      'Azienda non in lista?',
      'Ecco i due motivi possibili:\n' +
        "- L'azienda è ancora in fase di verifica. Di solito l'attivazione richiede poche ore.\n" +
        "- L'azienda non è stata ancora registrata.",
      { cancel: 'Chiudi', confirm: 'Registra' }
    );
    // TODO tappa 4: portare a Primi Passi (registrazione azienda). Per ora si apre il Tutorial.
    if (goRegister) router.push('/tutorial');
  };

  // [miglioria] Nell'elenco solo i locali attivi (il QR di un locale non attivo viene comunque riconosciuto).
  const activeLocali = (locali ?? []).filter((item) => item.status === 'Attivo');

  return (
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Text style={styles.stepTitle}>1. Imposta il tuo nome per iniziare</Text>
        <Text style={styles.stepNote}>(non potrai cambiarlo in seguito)</Text>
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
          {nameError ? 'Inserisci sia il Nome che il Cognome' : 'Assicurati di scrivere Nome e Cognome completi'}
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
            <Pressable onPress={companyNotListed} accessibilityRole="button">
              <Text style={styles.link}>La tua azienda non è in lista?</Text>
            </Pressable>
          </View>
        )}
      </ScrollView>
      <BusyOverlay text={busy} />
      {scanner}
    </KeyboardAvoidingView>
  );
}

function AlreadyRegistered() {
  const [activities, setActivities] = useState<Activity[]>(getActivities);

  const resetActivities = async () => {
    log('Accesso Dipendenti: Richiesta Azzeramento Orari');
    const confirmed = await confirmAlert(
      'Azzeramento Orari sul dispositivo',
      'Procedendo eliminerai le tue ultime attività salvate su questo telefono. Gli orari registrati nel registro ' +
        "online dell'azienda non vengono modificati.",
      { confirm: 'Azzera', destructive: true }
    );
    if (!confirmed) return;
    log('Accesso Dipendenti: Richiesta Azzeramento Orari confermata');
    clearActivities();
    setActivities([]);
  };

  const removeData = async () => {
    log('Accesso Dipendenti: Richiesta Rimozione Dati');
    const confirmed = await confirmAlert(
      'Rimozione dati',
      'Il tuo nome e la tua azienda verranno cancellati da questo telefono e dovrai registrarti di nuovo.',
      { confirm: 'Conferma', destructive: true }
    );
    if (!confirmed) return;
    log('Accesso Dipendenti: Richiesta Rimozione Dati - Confermata');
    removeEmployee();
    updateSession({ locale: null });
    await infoAlert('Dati eliminati', 'Eseguito correttamente');
    restartFromSplash();
  };

  return (
    <View style={styles.flex}>
      <View style={styles.registeredHeader}>
        <BrandTitle text="Accesso già effettuato." />
        <Text style={styles.paragraph}>
          Per evitare l&apos;utilizzo di più utenti con lo stesso dispositivo non è possibile registrare un altro nome.
          È un caso particolare o vorresti azzerare i tuoi dati?
        </Text>
      </View>
      <ScrollView contentContainerStyle={styles.activities}>
        {activities.length === 0 ? (
          <Text style={styles.empty}>Ancora nessuna attività</Text>
        ) : (
          activities.map((item, index) => (
            <Text key={index} style={styles.activity}>
              {activityLabel(item)}
            </Text>
          ))
        )}
      </ScrollView>
      <View style={styles.footer}>
        <AppButton title="Azzera Ultime Attività" onPress={resetActivities} disabled={activities.length === 0} />
        <Pressable onPress={removeData} accessibilityRole="button">
          <Text style={styles.link}>Richiedi la rimozione dei tuoi dati</Text>
        </Pressable>
      </View>
    </View>
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
  registeredHeader: {
    padding: spacing.md,
    gap: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  paragraph: { fontSize: 15, color: colors.text, textAlign: 'center', lineHeight: 21 },
  activities: { paddingHorizontal: spacing.md },
  activity: {
    paddingVertical: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
    color: colors.text,
    fontSize: 15,
  },
  empty: { textAlign: 'center', color: colors.muted, paddingVertical: spacing.lg },
  footer: { padding: spacing.md, gap: spacing.xs, alignItems: 'stretch' },
});
