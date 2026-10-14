import { router } from 'expo-router';
import LottieView from 'lottie-react-native';
import { useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AppButton } from '@/components/AppButton';
import { colors, spacing } from '@/theme';

// Primi Passi (SPEC §10): tre pagine prima della richiesta del QR Code.
// [interpretazione] i testi delle pagine 2 e 3 sono troncati negli screenshot e sono stati completati.
const PAGES = [
  {
    animation: require('../../assets/lottie/form-registration.json'),
    text:
      "Registra il nome della tua attività e ricevi subito la mail per l'attivazione del servizio. Un nostro " +
      'collaboratore si metterà in contatto per guidarti e per inviarti il QR Code.',
  },
  {
    animation: require('../../assets/lottie/wait-and-download.json'),
    text:
      'Mentre attendi che un nostro collaboratore si metta in contatto con te, fai scaricare TeamTime ai tuoi ' +
      'dipendenti.',
  },
  {
    animation: require('../../assets/lottie/splash.json'),
    text:
      'Una volta ottenuto, il QR Code sarà già attivo e i tuoi dipendenti potranno iniziare subito a registrare ' +
      'entrate e uscite.',
  },
];

export default function PrimiPassiScreen() {
  const [page, setPage] = useState(0);
  const current = PAGES[page];
  const last = page === PAGES.length - 1;

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.content}>
        <LottieView key={page} source={current.animation} autoPlay loop style={styles.animation} />
        <Text style={styles.text}>{current.text}</Text>
        <View style={styles.actions}>
          {last ? (
            <>
              {/* [develop 14/10/2026] "Come vuoi iniziare?": prova gratuita dall'app (SPEC §17) o modulo di contatto. */}
              <AppButton title="Prova gratis 30 giorni" onPress={() => router.replace('/prova-gratuita')} />
              <AppButton
                title="Preferisco essere contattato"
                variant="outline"
                onPress={() => router.replace('/registra-azienda')}
                style={styles.secondButton}
              />
            </>
          ) : (
            <AppButton title="Continua" onPress={() => setPage(page + 1)} />
          )}
        </View>
        <Text style={styles.pageNumber}>
          Pagina {page + 1}/{PAGES.length}
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  content: { flexGrow: 1, justifyContent: 'center', alignItems: 'center', padding: spacing.lg, gap: spacing.md },
  animation: { width: 280, height: 240 },
  text: { fontSize: 17, lineHeight: 24, color: colors.text, textAlign: 'center' },
  actions: { alignSelf: 'stretch', marginTop: spacing.sm },
  pageNumber: { color: colors.muted, fontSize: 13 },
  secondButton: { marginTop: spacing.sm },
});
