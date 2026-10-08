import { useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { WebView } from 'react-native-webview';

import { AppButton } from '@/components/AppButton';
import { log } from '@/lib/log';
import { calendarUrl } from '@/lib/manager';
import { useSession } from '@/lib/session';
import { colors, spacing } from '@/theme';

// Calendario (SPEC §8): vista condivisa di Airtable "URL Monitor", come nel portale.
export default function CalendarioScreen() {
  const { manager } = useSession();
  const url = manager ? calendarUrl(manager) : null;
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <Text style={styles.note}>Il caricamento del registro può richiedere alcuni istanti</Text>
      {!url ? (
        <View style={styles.center}>
          <Text style={styles.muted}>Calendario non disponibile per questa azienda. Contatta l&apos;assistenza.</Text>
        </View>
      ) : failed ? (
        <View style={styles.center}>
          <Text style={styles.muted}>Calendario non caricato: controlla la connessione.</Text>
          <AppButton
            title="Riprova"
            variant="outline"
            onPress={() => {
              setFailed(false);
              setLoading(true);
              setReloadKey((key) => key + 1);
            }}
          />
        </View>
      ) : (
        <View style={styles.flex}>
          <WebView
            key={reloadKey}
            source={{ uri: url }}
            style={styles.flex}
            onLoadEnd={() => setLoading(false)}
            onError={(event) => {
              log(`Calendario: errore ${event.nativeEvent.description}`);
              setFailed(true);
            }}
            sharedCookiesEnabled
          />
          {loading && <ActivityIndicator size="large" color={colors.primary} style={styles.loader} />}
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  flex: { flex: 1 },
  note: { textAlign: 'center', color: colors.muted, fontSize: 13, paddingVertical: spacing.sm },
  center: { flex: 1, justifyContent: 'center', padding: spacing.lg, gap: spacing.md },
  muted: { color: colors.muted, textAlign: 'center' },
  loader: { position: 'absolute', top: spacing.xl, alignSelf: 'center' },
});
