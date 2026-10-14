import { useState } from 'react';
import { Alert, FlatList, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AppButton } from '@/components/AppButton';
import { confirmAlert } from '@/lib/dialogs';
import { getLog, log } from '@/lib/log';
import { backToHome } from '@/lib/navigation';
import { sendReportToDeveloper } from '@/lib/report';
import { reportError } from '@/lib/sentry';
import { colors, spacing } from '@/theme';

// Log Error (SPEC §11): log della sessione, invio allo sviluppatore come riga della tabella Assistenza.
export default function LogErrorScreen() {
  const [entries] = useState(getLog);
  const [sending, setSending] = useState(false);

  const share = async () => {
    const confirmed = await confirmAlert('Confermi?', 'Vuoi davvero inviare questo report allo sviluppatore?', {
      confirm: 'Invia',
    });
    if (!confirmed) return;
    setSending(true);
    try {
      await sendReportToDeveloper();
      Alert.alert('Report inviato', 'Grazie! Lo sviluppatore lo esaminerà al più presto.', [
        { text: 'OK', onPress: backToHome },
      ]);
    } catch (error) {
      log(`Invio report non riuscito: ${String(error)}`);
      Alert.alert('Invio non riuscito', 'Controlla la connessione e riprova.');
    } finally {
      setSending(false);
    }
  };

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.buttons}>
        <AppButton title="Torna in Home" onPress={backToHome} style={styles.flex} />
        <AppButton title="Condividi con sviluppatore" onPress={share} loading={sending} style={styles.flex} />
      </View>
      {__DEV__ && (
        // Solo nelle build di sviluppo: verifica che Sentry riceva gli errori.
        <AppButton
          title="Prova Sentry (solo sviluppo)"
          onPress={() => {
            reportError(new Error('Errore di prova Sentry'), 'test');
            Alert.alert('Inviato', 'Errore di prova mandato a Sentry: controlla su de.sentry.io tra qualche minuto.');
          }}
          style={styles.test}
        />
      )}
      <FlatList
        data={entries}
        keyExtractor={(_, index) => String(index)}
        contentContainerStyle={styles.list}
        ListEmptyComponent={<Text style={styles.empty}>Nessun messaggio</Text>}
        renderItem={({ item }) => <Text style={styles.row}>{item}</Text>}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  buttons: { flexDirection: 'row', gap: spacing.sm, padding: spacing.md },
  flex: { flex: 1, paddingHorizontal: spacing.sm },
  test: { marginHorizontal: spacing.md, marginBottom: spacing.sm },
  list: { paddingHorizontal: spacing.md, paddingBottom: spacing.xl },
  empty: { textAlign: 'center', color: colors.muted, paddingVertical: spacing.lg },
  row: {
    paddingVertical: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
    color: colors.muted,
    fontSize: 13,
  },
});
