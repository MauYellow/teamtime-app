import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import {
  KeyboardAvoidingView,
  Linking,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AppButton } from '@/components/AppButton';
import { BrandTitle } from '@/components/BrandTitle';
import { LogoHeader } from '@/components/LogoHeader';
import { DATA_REMOVAL_FORM_URL } from '@/config';
import { log } from '@/lib/log';
import { loginManager } from '@/lib/manager';
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
    setLoading(true);
    try {
      const result = await loginManager(username, password);
      if (!result.ok) {
        log(`Registro Online: accesso negato per ${username.trim()} (${result.message})`);
        setError(result.message);
        return;
      }
      if (remember) await saveManagerCredentials(username.trim(), password);
      else await clearManagerCredentials();
      log(`Registro Online: accesso effettuato ${result.locale.Locale}`);
      updateSession({ manager: result.locale });
      router.push('/calendario');
    } catch (err) {
      log(`Registro Online: errore ${String(err)}`);
      setError('Connessione scarsa o assente. Riprovare fra pochi minuti.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <LogoHeader variant="icon" />
          <BrandTitle text="Accesso Registro Online" style={styles.title} />
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
          <Pressable onPress={() => router.push('/tutorial')} accessibilityRole="link">
            <Text style={styles.link}>La tua azienda non è ancora registrata?</Text>
          </Pressable>
          <View style={styles.switchRow}>
            <Text style={styles.switchLabel}>Ricorda dati</Text>
            <Switch
              value={remember}
              onValueChange={toggleRemember}
              trackColor={{ true: colors.primary, false: colors.border }}
            />
          </View>
          {error && <Text style={styles.error}>{error}</Text>}
          <AppButton title="Accedi" onPress={login} loading={loading} style={styles.button} />
          <Text style={styles.small}>
            Accettando dichiaro di aver letto e compreso l&apos;
            <Text style={styles.inlineLink} onPress={() => router.push('/informativa-cookie')} accessibilityRole="link">
              informativa sulla privacy
            </Text>
          </Text>
        </ScrollView>
      </KeyboardAvoidingView>
      {/* In basso, appena sopra il menu. */}
      <Pressable onPress={() => Linking.openURL(DATA_REMOVAL_FORM_URL)} accessibilityRole="link" style={styles.footer}>
        <Text style={styles.removal}>Richiedi rimozione dei tuoi dati aziendali</Text>
      </Pressable>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  flex: { flex: 1 },
  content: { padding: spacing.lg, paddingTop: 0, gap: spacing.sm, alignItems: 'stretch' },
  title: { marginTop: spacing.md },
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
  link: {
    textAlign: 'center',
    color: colors.primary,
    fontSize: 14,
    textDecorationLine: 'underline',
    paddingVertical: spacing.xs,
  },
  inlineLink: { color: colors.primary, textDecorationLine: 'underline' },
  footer: { paddingVertical: spacing.sm, paddingHorizontal: spacing.lg },
  removal: { textAlign: 'center', color: colors.primary, fontSize: 13, textDecorationLine: 'underline' },
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
