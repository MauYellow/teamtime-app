import { router } from 'expo-router';
import { SymbolView, type SymbolViewProps } from 'expo-symbols';
import { useState } from 'react';
import {
  Alert,
  Image,
  KeyboardAvoidingView,
  Linking,
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
import { useTimePicker } from '@/components/TimePicker';
import { formatTime } from '@/lib/activities';
import { log } from '@/lib/log';
import { submitRequest, validateRequest, whatsappUrl, type CompanyRequest } from '@/lib/registration';
import type { SentCompanyRequest } from '@/lib/storage';
import { colors, radius, spacing } from '@/theme';

const STEPS = ['Richiedi QR Code', 'Calendario e contatto', 'Conferma e assistenza'];

const TODO: { icon: SymbolViewProps['name']; text: string }[] = [
  { icon: { ios: 'envelope.fill', android: 'mail' }, text: 'Rispondi alla mail appena ricevuta' },
  { icon: { ios: 'icloud.and.arrow.down.fill', android: 'cloud_download' }, text: 'Fai scaricare l’app ai tuoi dipendenti' },
  { icon: { ios: 'qrcode', android: 'qr_code_2' }, text: 'Pensa dove posizionare il QR Code' },
];

function formatDay(date: Date) {
  return date.toLocaleDateString('it-IT', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
}

// Registrazione azienda (SPEC §10): i tre passi della schermata "Richiedi QR Code" di Thunkable.
export default function RegistraAziendaScreen() {
  const [step, setStep] = useState(0);
  const [request, setRequest] = useState<CompanyRequest>({ locale: '', mail: '', phone: '', employees: '' });
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  // Giorno e ora partono vuoti: Conferma si attiva solo dopo averli scelti.
  const [day, setDay] = useState<Date | null>(null);
  const [time, setTime] = useState<Date | null>(null);
  const [sent, setSent] = useState<SentCompanyRequest | null>(null);
  const { pickDate, pickTime, picker } = useTimePicker();

  const update = (key: keyof CompanyRequest) => (value: string) => setRequest((current) => ({ ...current, [key]: value }));

  const goToCalendar = async () => {
    setError(null);
    setLoading(true);
    try {
      const message = await validateRequest(request);
      if (message) {
        log(`Richiedi QR Code: ${message}`);
        setError(message);
        return;
      }
      setStep(1);
    } catch (err) {
      log(`Richiedi QR Code: errore ${String(err)}`);
      setError('Connessione scarsa o assente. Riprovare fra pochi minuti.');
    } finally {
      setLoading(false);
    }
  };

  const chooseDay = async () => {
    const value = await pickDate('Scegli il giorno', day ?? new Date(), new Date());
    if (value) setDay(value);
  };

  const chooseTime = async () => {
    const value = await pickTime('Scegli l’orario', time ?? new Date());
    if (value) setTime(value);
  };

  const confirm = async () => {
    if (!day || !time) return;
    setLoading(true);
    try {
      setSent(await submitRequest(request, day, time));
      setStep(2);
    } catch (err) {
      log(`Quando Contattare: errore ${String(err)}`);
      Alert.alert('Errore', 'Richiesta non inviata: controlla la connessione e riprova.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.steps}>
        {STEPS.map((label, index) => (
          <View key={label} style={[styles.step, index === step && styles.stepActive]}>
            <Text style={[styles.stepText, index === step && styles.stepTextActive]}>{label}</Text>
          </View>
        ))}
      </View>
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <Image source={require('../../assets/images/logo.png')} style={styles.logo} resizeMode="contain" />

          {step === 0 && (
            <>
              <Text style={styles.text}>
                Richiedi il QR Code relativo alla tua attività. Ogni volta che verrà scannerizzato dai tuoi dipendenti
                registrerà l&apos;orario di arrivo e di uscita. Solo tu potrai avere accesso al registro presenze.
              </Text>
              <TextInput
                style={styles.input}
                placeholder="Nome del locale (senza spazi)"
                placeholderTextColor={colors.muted}
                value={request.locale}
                onChangeText={update('locale')}
                autoCapitalize="none"
                autoCorrect={false}
              />
              <TextInput
                style={styles.input}
                placeholder="La tua migliore mail"
                placeholderTextColor={colors.muted}
                value={request.mail}
                onChangeText={update('mail')}
                autoCapitalize="none"
                keyboardType="email-address"
                textContentType="emailAddress"
                autoComplete="email"
              />
              <TextInput
                style={styles.input}
                placeholder="Numero di telefono"
                placeholderTextColor={colors.muted}
                value={request.phone}
                onChangeText={update('phone')}
                keyboardType="phone-pad"
                textContentType="telephoneNumber"
                autoComplete="tel"
              />
              <Text style={styles.small}>Ti contatteremo telefonicamente per l&apos;attivazione del QR Code</Text>
              <TextInput
                style={styles.input}
                placeholder="Numero Dipendenti"
                placeholderTextColor={colors.muted}
                value={request.employees}
                onChangeText={update('employees')}
                keyboardType="number-pad"
              />
              {error && <Text style={styles.error}>{error}</Text>}
              <AppButton title="Continua" onPress={goToCalendar} loading={loading} style={styles.button} />
            </>
          )}

          {step === 1 && (
            <>
              <Text style={styles.text}>Il tuo tempo è importante{'\n'}Scegli quando essere contattato telefonicamente</Text>
              <Pressable onPress={chooseDay} accessibilityRole="button" style={styles.choice}>
                <SymbolView name={{ ios: 'calendar', android: 'calendar_month' }} tintColor={colors.primary} size={32} />
                <View style={styles.flex}>
                  <Text style={styles.choiceTitle}>Scegli Giorno</Text>
                  <Text style={[styles.choiceValue, !day && styles.placeholder]}>
                    {day ? formatDay(day) : 'Tocca per scegliere il giorno'}
                  </Text>
                </View>
              </Pressable>
              <Pressable onPress={chooseTime} accessibilityRole="button" style={styles.choice}>
                <SymbolView name={{ ios: 'clock', android: 'schedule' }} tintColor={colors.primary} size={32} />
                <View style={styles.flex}>
                  <Text style={styles.choiceTitle}>Scegli Orario</Text>
                  <Text style={[styles.choiceValue, !time && styles.placeholder]}>
                    {time ? formatTime(time) : "Tocca per scegliere l'orario"}
                  </Text>
                </View>
              </Pressable>
              <Text style={styles.small}>
                Faremo il possibile per contattarti in quel giorno e fascia oraria. Assicurati di essere libero nel
                periodo indicato, la call durerà pochi minuti.
              </Text>
              <AppButton
                title="Conferma"
                onPress={confirm}
                loading={loading}
                disabled={!day || !time}
                style={styles.button}
              />
            </>
          )}

          {step === 2 && (
            <>
              <Text style={styles.text}>
                Sarai contattato da un nostro collaboratore nelle prossime ore per l&apos;attivazione.
              </Text>
              <Text style={styles.subtitle}>Ecco cosa puoi fare al momento:</Text>
              {TODO.map((item) => (
                <View key={item.text} style={styles.todo}>
                  <SymbolView name={item.icon} tintColor={colors.primary} size={28} />
                  <Text style={styles.todoText}>{item.text}</Text>
                </View>
              ))}
              <AppButton
                title="Assistenza WhatsApp"
                onPress={() => Linking.openURL(whatsappUrl(sent))}
                style={[styles.button, styles.whatsapp]}
              />
              <AppButton title="Torna in Home" onPress={() => router.dismissTo('/home')} />
            </>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
      {picker}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  flex: { flex: 1 },
  steps: { flexDirection: 'row', borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  step: { flex: 1, paddingVertical: spacing.sm, borderBottomWidth: 2, borderBottomColor: 'transparent' },
  stepActive: { borderBottomColor: colors.primary },
  stepText: { textAlign: 'center', fontSize: 12, color: colors.muted, textTransform: 'uppercase' },
  stepTextActive: { color: colors.primary, fontWeight: '700' },
  content: { padding: spacing.lg, gap: spacing.sm },
  logo: { width: 90, height: 90, alignSelf: 'center' },
  text: { fontSize: 16, lineHeight: 22, color: colors.text, textAlign: 'center', marginBottom: spacing.sm },
  subtitle: { fontSize: 16, fontWeight: '700', color: colors.text, textAlign: 'center', marginTop: spacing.md },
  small: { fontSize: 13, color: colors.muted, textAlign: 'center' },
  input: {
    backgroundColor: colors.inputBackground,
    borderRadius: radius.input,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 4,
    fontSize: 16,
    color: colors.text,
  },
  error: { color: colors.error, fontWeight: '600', textAlign: 'center' },
  button: { marginTop: spacing.sm },
  choice: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.md,
    borderRadius: radius.card,
    backgroundColor: colors.surface,
  },
  choiceTitle: { fontSize: 17, fontWeight: '700', color: colors.text },
  choiceValue: { fontSize: 15, color: colors.text, marginTop: 2 },
  placeholder: { color: colors.muted, fontStyle: 'italic' },
  todo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  todoText: { flex: 1, fontSize: 15, color: colors.text },
  whatsapp: { backgroundColor: '#25D366' },
});
