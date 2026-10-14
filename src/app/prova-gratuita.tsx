import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Linking,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type TextInputProps,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AppButton } from '@/components/AppButton';
import { BrandTitle } from '@/components/BrandTitle';
import { BusyOverlay } from '@/components/BusyOverlay';
import { LogoHeader } from '@/components/LogoHeader';
import { EULA_URL, PRIVACY_URL, WHATSAPP_SUPPORT_URL } from '@/config';
import { findFirst, formulaString } from '@/lib/airtable';
import { LOCALI_TABLE, type LocaleFields } from '@/lib/locali';
import { log } from '@/lib/log';
import { updateSession } from '@/lib/session';
import { saveManagerCredentials } from '@/lib/storage';
import {
  activateLocale,
  getPendingActivation,
  isPurchasesReady,
  startTrialPaywall,
  type Activation,
  type CompanyData,
} from '@/lib/subscription';
import { colors, radius, spacing } from '@/theme';

// Prova gratis 30 giorni (SPEC §17): dati azienda come il portale → paywall RevenueCat → attivazione del locale →
// credenziali e ingresso nell'area manager. Si arriva da "Conferma e assistenza", dopo la richiesta di contatto
// (mail e telefono già compilati).

const EMPTY: CompanyData = { ragioneSociale: '', partitaIva: '', indirizzo: '', mail: '', telefono: '' };

export default function ProvaGratuitaScreen() {
  const params = useLocalSearchParams<{ mail?: string; telefono?: string }>();
  const [data, setData] = useState<CompanyData>({
    ...EMPTY,
    mail: params.mail ?? '',
    telefono: params.telefono ?? '',
  });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [pending, setPending] = useState(() => getPendingActivation());
  const [done, setDone] = useState<Activation | null>(null);

  const set = (key: keyof CompanyData) => (value: string) => setData((current) => ({ ...current, [key]: value }));

  const validate = async (): Promise<string | null> => {
    const values = Object.values(data).map((value) => value.trim());
    if (values.some((value) => !value) || !data.mail.includes('@')) return 'Compila tutti i campi correttamente';
    // La mail è anche il nome utente del Registro Online: deve essere di una sola azienda.
    const existing = await findFirst<LocaleFields>(
      LOCALI_TABLE,
      `LOWER(TRIM({Mail})) = LOWER(${formulaString(data.mail.trim())})`
    );
    if (existing) return 'Questa mail è già registrata: accedi dal Registro Online oppure usa un’altra mail';
    return null;
  };

  const activate = async (company?: CompanyData) => {
    setBusy('Attivazione della tua azienda..');
    try {
      const result = await activateLocale(company);
      setPending(null);
      setDone(result);
    } catch (err) {
      log(`Prova gratuita: attivazione non riuscita ${String(err)}`);
      setPending(getPendingActivation());
      Alert.alert(
        'Attivazione non completata',
        'Il tuo abbonamento è registrato, ma l’attivazione non è finita (connessione?). Riprova tra poco: se non ' +
          'funziona, contattaci e la completiamo noi.'
      );
    } finally {
      setBusy(null);
    }
  };

  const start = async () => {
    if (!isPurchasesReady()) {
      Alert.alert('Non disponibile', 'L’acquisto dall’app non è disponibile al momento. Contattaci per attivare TeamTime.');
      return;
    }
    setError(null);
    setBusy('Controllo dei dati..');
    let problem: string | null;
    try {
      problem = await validate();
    } catch {
      problem = 'Connessione scarsa o assente. Riprovare fra pochi minuti.';
    }
    setBusy(null);
    if (problem) {
      setError(problem);
      return;
    }
    const company: CompanyData = {
      ragioneSociale: data.ragioneSociale.trim(),
      partitaIva: data.partitaIva.trim(),
      indirizzo: data.indirizzo.trim(),
      mail: data.mail.trim().toLowerCase(),
      telefono: data.telefono.trim(),
    };
    const outcome = await startTrialPaywall();
    if (!outcome.purchased) {
      if (outcome.error) Alert.alert('Acquisto non riuscito', 'Nessun addebito. Riprova tra poco.');
      return;
    }
    await activate(company);
  };

  const enter = async () => {
    if (!done?.locale.Locale) return;
    await saveManagerCredentials(done.locale.Locale, done.password);
    updateSession({ manager: done.locale });
    router.replace('/calendario');
  };

  if (done) {
    return (
      <SafeAreaView style={styles.safe}>
        <ScrollView contentContainerStyle={styles.content}>
          <LogoHeader variant="icon" />
          <BrandTitle text="Benvenuto in TeamTime!" style={styles.title} />
          {done.test ? (
            <Text style={styles.error}>
              Acquisto di prova (sandbox): nessuna scrittura su Airtable e nessuna mail. Il riepilogo è su Telegram.
            </Text>
          ) : (
            <Text style={styles.text}>
              La tua prova gratuita è attiva. Ti abbiamo inviato una mail con la password e il QR Code da stampare.
            </Text>
          )}
          <View style={styles.card}>
            <Text style={styles.label}>Nome QR Code</Text>
            <Text style={styles.value} selectable>
              {done.locale.Locale}
            </Text>
            <Text style={styles.label}>Password</Text>
            <Text style={styles.value} selectable>
              {done.password}
            </Text>
          </View>
          <Text style={styles.small}>
            Con questi dati (o con la tua mail) accedi al Registro Online dall’app e dal sito www.teamtimeapp.it.
          </Text>
          {done.test ? (
            <AppButton title="Chiudi" onPress={() => router.back()} style={styles.button} />
          ) : (
            <AppButton title="Entra nell'area manager" onPress={enter} style={styles.button} />
          )}
        </ScrollView>
      </SafeAreaView>
    );
  }

  if (pending) {
    return (
      <SafeAreaView style={styles.safe}>
        <ScrollView contentContainerStyle={styles.content}>
          <LogoHeader variant="icon" />
          <BrandTitle text="Completa l'attivazione" style={styles.title} />
          <Text style={styles.text}>
            Abbiamo ricevuto il tuo abbonamento per {pending.data.ragioneSociale}, ma l’attivazione non è finita.
          </Text>
          <AppButton title="Completa attivazione" onPress={() => activate()} style={styles.button} />
          <AppButton
            title="Contatta l'assistenza"
            variant="outline"
            onPress={() => Linking.openURL(WHATSAPP_SUPPORT_URL)}
          />
        </ScrollView>
        <BusyOverlay text={busy} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <LogoHeader variant="icon" />
          <Text style={styles.heading}>Prova gratis 30 giorni</Text>
          <Text style={styles.text}>
            Inserisci i dati della tua azienda, poi scegli il piano. Per 30 giorni non paghi nulla e puoi disdire
            quando vuoi.
          </Text>
          <Field placeholder="Ragione Sociale" value={data.ragioneSociale} onChangeText={set('ragioneSociale')} />
          <Field
            placeholder="Partita IVA"
            value={data.partitaIva}
            onChangeText={set('partitaIva')}
            autoCapitalize="characters"
          />
          <Field placeholder="Indirizzo" value={data.indirizzo} onChangeText={set('indirizzo')} />
          <Field
            placeholder="Mail"
            value={data.mail}
            onChangeText={set('mail')}
            keyboardType="email-address"
            autoCapitalize="none"
            autoComplete="email"
          />
          <Field
            placeholder="Telefono"
            value={data.telefono}
            onChangeText={set('telefono')}
            keyboardType="phone-pad"
            autoComplete="tel"
          />
          {error && <Text style={styles.error}>{error}</Text>}
          <AppButton title="Inizia la Prova Gratuita di 30 Giorni" onPress={start} style={styles.button} />
          <Text style={styles.small}>
            Oggi non paghi nulla. Al termine dei 30 giorni di prova inizierà l’abbonamento annuale al prezzo del piano
            scelto, rinnovato automaticamente ogni anno. Puoi disdire quando vuoi, anche durante la prova, dalle
            impostazioni degli abbonamenti del tuo account {Platform.OS === 'ios' ? 'Apple' : 'Google Play'}.
            Continuando accetti i{' '}
            <Text style={styles.link} onPress={() => Linking.openURL(EULA_URL)} accessibilityRole="link">
              termini e condizioni (EULA)
            </Text>{' '}
            e l&apos;
            <Text style={styles.link} onPress={() => Linking.openURL(PRIVACY_URL)} accessibilityRole="link">
              informativa sulla privacy
            </Text>
            .
          </Text>
        </ScrollView>
      </KeyboardAvoidingView>
      <BusyOverlay text={busy} />
    </SafeAreaView>
  );
}

function Field(props: TextInputProps) {
  return <TextInput style={styles.input} placeholderTextColor={colors.muted} autoCorrect={false} {...props} />;
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  flex: { flex: 1 },
  content: { padding: spacing.lg, paddingTop: 0, gap: spacing.sm },
  title: { marginTop: spacing.md },
  heading: { fontSize: 24, fontWeight: '700', color: colors.text, textAlign: 'center', marginTop: spacing.md },
  text: { textAlign: 'center', color: colors.text, fontSize: 15, lineHeight: 21, marginBottom: spacing.sm },
  input: {
    backgroundColor: colors.inputBackground,
    borderRadius: radius.input,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 4,
    fontSize: 16,
    color: colors.text,
  },
  error: { textAlign: 'center', color: colors.error, fontWeight: '600' },
  button: { marginVertical: spacing.sm },
  small: { textAlign: 'center', color: colors.muted, fontSize: 13, lineHeight: 19 },
  link: { color: colors.primary, textDecorationLine: 'underline' },
  card: { backgroundColor: colors.surface, borderRadius: radius.card, padding: spacing.md, gap: spacing.xs },
  label: { color: colors.muted, fontSize: 14 },
  value: { color: colors.text, fontSize: 20, fontWeight: '700', marginBottom: spacing.sm },
});
