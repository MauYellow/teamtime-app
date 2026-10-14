import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import {
  KeyboardAvoidingView,
  Linking,
  Platform,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AppButton } from '@/components/AppButton';
import { LogoHeader } from '@/components/LogoHeader';
import { DATA_REMOVAL_FORM_URL } from '@/config';
import { log } from '@/lib/log';
import { loginManager } from '@/lib/manager';
import { askReview, countManagerLoginForReview, shouldAskReview } from '@/lib/review';
import type { LocaleFields } from '@/lib/locali';
import { renewSubscription } from '@/lib/subscription';
import { updateSession } from '@/lib/session';
import { clearManagerCredentials, getManagerCredentials, saveManagerCredentials } from '@/lib/storage';
import { colors, radius, spacing } from '@/theme';

// Registro Online (SPEC §7): accesso del manager all'area di gestione.
export default function RegistroScreen() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [remember, setRemember] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  /** Locale con l'abbonamento dagli store scaduto: mostra "Rinnova abbonamento". */
  const [renewable, setRenewable] = useState<LocaleFields | null>(null);

  // Credenziali ricordate ("Ricorda dati"), anche quelle migrate dalla vecchia app.
  useFocusEffect(
    useCallback(() => {
      getManagerCredentials().then((saved) => {
        if (!saved) return;
        setUsername(saved.locale);
        setPassword(saved.password);
        setRemember(true);
      });
    }, [])
  );

  const toggleRemember = (value: boolean) => {
    setRemember(value);
    // Come l'originale: spegnendo l'interruttore si cancellano subito i dati salvati.
    if (!value) clearManagerCredentials();
  };

  const login = async () => {
    if (!username.trim() || !password) {
      setError('Inserisci Nome QR Code (o Mail) e Password');
      return;
    }
    setError(null);
    setRenewable(null);
    setLoading(true);
    try {
      const result = await loginManager(username, password);
      if (!result.ok) {
        log(`Registro Online: accesso negato per ${username.trim()} (${result.message})`);
        setError(result.message);
        setRenewable(result.renew ?? null);
        return;
      }
      if (remember) await saveManagerCredentials(username.trim(), password);
      else await clearManagerCredentials();
      log(`Registro Online: accesso effettuato ${result.locale.Locale}`);
      updateSession({ manager: result.locale, managerToken: result.token });
      router.push('/calendario');
      // Richiesta di recensione ogni 10 accessi (SPEC §4), sopra il calendario appena aperto.
      countManagerLoginForReview();
      if (shouldAskReview()) setTimeout(askReview, 800);
    } catch (err) {
      log(`Registro Online: errore ${String(err)}`);
      setError('Connessione scarsa o assente. Riprovare fra pochi minuti.');
    } finally {
      setLoading(false);
    }
  };

  const renew = async () => {
    if (!renewable) return;
    setLoading(true);
    let locale: LocaleFields | null;
    try {
      locale = await renewSubscription(renewable);
    } finally {
      setLoading(false);
    }
    if (locale?.Status !== 'Attivo') return;
    log(`Registro Online: abbonamento rinnovato ${locale.Locale}`);
    setRenewable(null);
    // Nuovo accesso: il proxy dà il gettone per l'area manager.
    await login();
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <LogoHeader variant="icon" />
          <Text style={styles.title}>Accesso Registro Online</Text>
          <Text style={styles.hint}>Compila i campi per accedere al registro online</Text>
          <TextInput
            style={styles.input}
            placeholder="Nome QR Code o Mail"
            placeholderTextColor={colors.muted}
            value={username}
            onChangeText={setUsername}
            autoCapitalize="none"
            autoCorrect={false}
            textContentType="username"
            autoComplete="username"
          />
          <Text style={styles.small}>Il sistema riconosce la differenza tra minuscole e maiuscole</Text>
          <TextInput
            style={styles.input}
            placeholder="Password"
            placeholderTextColor={colors.muted}
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            autoCapitalize="none"
            textContentType="password"
            autoComplete="password"
            onSubmitEditing={login}
          />
          {/* [develop 14/10/2026] Un solo link: porta alla prima pagina del Tutorial. */}
          <Text style={styles.signup}>
            Non hai un account?{' '}
            <Text style={styles.inlineLink} onPress={() => router.push('/tutorial')} accessibilityRole="link">
              Registrati Ora
            </Text>
          </Text>
          <View style={styles.switchRow}>
            <Text style={styles.switchLabel}>Ricorda dati</Text>
            <Switch
              value={remember}
              onValueChange={toggleRemember}
              trackColor={{ true: colors.primary, false: colors.border }}
            />
          </View>
          {error && <Text style={styles.error}>{error}</Text>}
          {renewable && <AppButton title="Rinnova abbonamento" onPress={renew} loading={loading} />}
          <AppButton title="Accedi" onPress={login} loading={loading} style={styles.button} />
        </ScrollView>
      </KeyboardAvoidingView>
      {/* In basso, appena sopra il menu: privacy e rimozione dei dati in un solo testo (14/10/2026). */}
      <View style={styles.footer}>
        <Text style={styles.small}>
          Accettando dichiaro di aver letto e compreso l&apos;
          <Text style={styles.inlineLink} onPress={() => router.push('/informativa-cookie')} accessibilityRole="link">
            informativa sulla privacy
          </Text>
          . Se vuoi richiedere la rimozione dei tuoi dati aziendali,{' '}
          <Text style={styles.inlineLink} onPress={() => Linking.openURL(DATA_REMOVAL_FORM_URL)} accessibilityRole="link">
            clicca qui
          </Text>
          .
        </Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  flex: { flex: 1 },
  content: { padding: spacing.lg, paddingTop: 0, gap: spacing.sm, alignItems: 'stretch' },
  title: { fontSize: 22, fontWeight: '700', color: colors.text, textAlign: 'center', marginTop: spacing.md },
  hint: { textAlign: 'center', color: colors.text, fontSize: 15, marginBottom: spacing.sm },
  input: {
    backgroundColor: colors.inputBackground,
    borderRadius: radius.input,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 4,
    fontSize: 16,
    color: colors.text,
  },
  small: { textAlign: 'center', color: colors.muted, fontSize: 13 },
  signup: { textAlign: 'center', color: colors.text, fontSize: 14, paddingVertical: spacing.xs },
  inlineLink: { color: colors.primary, textDecorationLine: 'underline' },
  footer: { paddingVertical: spacing.sm, paddingHorizontal: spacing.lg },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.xs,
  },
  switchLabel: { fontSize: 16, color: colors.text },
  error: { textAlign: 'center', color: colors.error, fontWeight: '600' },
  button: { marginVertical: spacing.sm },
});
