import { router } from 'expo-router';
import LottieView from 'lottie-react-native';
import { useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AppButton } from '@/components/AppButton';
import { colors, spacing } from '@/theme';

// Tutorial (SPEC §10): tre pagine con "Continua"; l'ultima porta alla registrazione azienda o ad Accesso Dipendenti.

const PAGES = [
  {
    animation: require('../../assets/lottie/splash.json'),
    text:
      "TeamTime nasce per aiutare le aziende ad avere un'organizzazione più dettagliata dell'orario di entrata, " +
      'di uscita e del conteggio delle ore mensile dei propri dipendenti.',
  },
  {
    animation: require('../../assets/lottie/scan-qr-code.json'),
    text:
      "Il personale scannerizza un QR Code all'entrata e all'uscita dal lavoro: l'orario viene registrato " +
      'automaticamente nel registro online della tua azienda.',
  },
  {
    animation: require('../../assets/lottie/calendar.json'),
    text:
      'Un registro online organizzato e protetto da password. Nel registro troverai un calendario con gli orari ' +
      'di tutto il personale.',
  },
];

export default function TutorialScreen() {
  const [page, setPage] = useState(0);
  const current = PAGES[page];
  const last = page === PAGES.length - 1;

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.content}>
        <LottieView key={page} source={current.animation} autoPlay loop style={styles.animation} />
        <Text style={styles.text}>{current.text}</Text>

        {last ? (
          <View style={styles.actions}>
            <AppButton
              title="Registra azienda"
              onPress={() => Alert.alert('In arrivo', 'La registrazione azienda arriva nella tappa 4.')}
            />
            <Text style={styles.or}>Oppure, se l&apos;azienda è stata già registrata</Text>
            <AppButton title="Continua come dipendente" onPress={() => router.replace('/accesso')} />
          </View>
        ) : (
          <View style={styles.actions}>
            <AppButton title="Continua" onPress={() => setPage(page + 1)} />
          </View>
        )}
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
  actions: { alignSelf: 'stretch', gap: spacing.md, marginTop: spacing.sm },
  or: { textAlign: 'center', color: colors.muted },
  pageNumber: { color: colors.muted, fontSize: 13 },
});
