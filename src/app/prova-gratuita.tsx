import { router, useLocalSearchParams } from 'expo-router';
import { SymbolView } from 'expo-symbols';
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
import { BusyOverlay } from '@/components/BusyOverlay';
import { LogoHeader } from '@/components/LogoHeader';
import { EULA_URL, PRIVACY_URL, WHATSAPP_SUPPORT_URL } from '@/config';
import { api, ApiError } from '@/lib/api';
import { log } from '@/lib/log';
import { reportError } from '@/lib/sentry';
import { saveManagerCredentials } from '@/lib/storage';
import {
  activateLocale,
  clearPendingActivation,
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
    const { exists } = await api<{ exists: boolean }>('/mail-exists', { mail: data.mail.trim() });
    if (exists) return 'Questa mail è già registrata: accedi dal Registro Online oppure usa un’altra mail';
    return null;
  };

  const activate = async (company?: CompanyData) => {
    setBusy('Attivazione della tua azienda..');
    try {
      const result = await activateLocale(company);
      // Credenziali ricordate subito ("Ricorda dati" del Registro Online), qualunque bottone scelga dopo.
      if (result.written !== false && result.locale.Locale) {
        await saveManagerCredentials(result.locale.Locale, result.password);
      }
      setPending(null);
      setDone(result);
    } catch (err) {
      log(`Prova gratuita: attivazione non riuscita ${String(err)}`);
      const code = err instanceof ApiError ? err.code : '';
      if (code === 'test_table_not_empty') {
        // Solo nelle prove: la tabella di prova va ripristinata prima di riprovare.
        clearPendingActivation();
        setPending(null);
        Alert.alert('Prova non eseguita', 'La tabella di prova teamtime037 non è vuota: ripristinarla e riprovare.');
        return;
      }
      if (code === 'no_table') {
        setPending(getPendingActivation());
        Alert.alert(
          'Attivazione in corso',
          'Il tuo abbonamento è registrato. Stiamo preparando la tua azienda: ti contattiamo noi a breve per completare ' +
            "l'attivazione."
        );
        return;
      }
      if (code === 'mail_exists') {
        setPending(getPendingActivation());
        Alert.alert(
          'Mail già registrata',
          'Questa mail risulta già registrata. Contattaci: colleghiamo noi il tuo abbonamento alla tua azienda.'
        );
        return;
      }
      reportError(err, 'activateLocale');
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

  if (done) {
    return (
      <SafeAreaView style={styles.safe}>
        <ScrollView contentContainerStyle={styles.content}>
          <LogoHeader variant="icon" />
          <Text style={styles.heading}>Benvenuto in TeamTime!</Text>
          {done.test && (
            <Text style={styles.error}>
              {done.written
                ? `Acquisto di prova (sandbox) scritto davvero su ${done.locale.Locale}: ricordati di ripristinarla.`
                : 'Acquisto di prova (sandbox): nessuna scrittura su Airtable e nessuna mail. Il riepilogo è su Telegram.'}
            </Text>
          )}
          <Text style={styles.text}>
            La tua prova gratuita è attiva. Riceverai una mail con i prossimi passi, la password e il QR Code da
            stampare (controlla anche nella cartella spam).
          </Text>
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
          <Text style={styles.subheading}>Prova l&apos;app</Text>
          <Text style={styles.small}>
            Registrati come dipendente della tua azienda ed esegui il tuo primo scan del QR Code di entrata.
          </Text>
          <AppButton title="Prova lo Scan del QR Code" onPress={() => router.replace('/accesso')} style={styles.button} />
          {/* [develop 14/10/2026] Niente bottone per l'area manager: si entra dal Registro Online (credenziali già
              ricordate). Il bottone che resta porta a provare lo scan come un dipendente. */}
          <View style={styles.hint}>
            <SymbolView
              name={{ ios: 'calendar.badge.clock', android: 'event_note' }}
              tintColor={colors.primary}
              size={26}
            />
            <Text style={styles.hintText}>
              Puoi accedere in qualsiasi momento all&apos;area manager toccando questa icona (
              <Text style={styles.bold}>Registro Online</Text>) nel menu in basso.
            </Text>
          </View>
        </ScrollView>
      </SafeAreaView>
    );
  }

  if (pending) {
    return (
      <SafeAreaView style={styles.safe}>
        <ScrollView contentContainerStyle={styles.content}>
          <LogoHeader variant="icon" />
          <Text style={styles.heading}>Completa l&apos;attivazione</Text>
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
            Inserisci i dati della tua azienda (o i tuoi, se sei un privato), poi scegli il piano. Per 30 giorni non paghi nulla e puoi disdire
            quando vuoi.
          </Text>
          <Field placeholder="Ragione Sociale o Nome e Cognome" value={data.ragioneSociale} onChangeText={set('ragioneSociale')} />
          <Field
            placeholder="Partita IVA o Codice Fiscale"
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
            <Text style={styles.bold}>Oggi non paghi nulla.</Text> Al termine dei 30 giorni di prova inizierà
            l’abbonamento annuale al prezzo del piano scelto, rinnovato automaticamente. Puoi disdire quando vuoi, anche durante la prova, dalle
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
  heading: { fontSize: 24, fontWeight: '700', color: colors.text, textAlign: 'center', marginTop: spacing.md },
  subheading: { fontSize: 17, fontWeight: '700', color: colors.text, textAlign: 'center', marginTop: spacing.lg },
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
  bold: { fontWeight: '700', color: colors.text },
  hint: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.surface,
    borderRadius: radius.card,
    padding: spacing.md,
  },
  hintText: { flex: 1, color: colors.text, fontSize: 14, lineHeight: 20 },
  card: { backgroundColor: colors.surface, borderRadius: radius.card, padding: spacing.md, gap: spacing.xs },
  label: { color: colors.muted, fontSize: 14 },
  value: { color: colors.text, fontSize: 20, fontWeight: '700', marginBottom: spacing.sm },
});
