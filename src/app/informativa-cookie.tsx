import { router } from 'expo-router';
import { ScrollView, StyleSheet, Text } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AppButton } from '@/components/AppButton';
import { colors, spacing } from '@/theme';

// Informativa cookie esterni (testo dello schermo Thunkable "Informativa cookie").
const POINTS = [
  "Nonostante tu possa aver richiesto di non essere tracciato durante l'uso dell'app TeamTime, ti potrà essere chiesto " +
    'di nuovo di scegliere di collezionare i cookies da un servizio esterno di Airtable.com autonomo e non sotto il ' +
    'controllo di TeamTime.',
  "I cookies richiesti dopo l'accesso al database non sono gestiti, collezionati o condivisi in nessun modo da " +
    'TeamTime, ma saranno gestiti da Airtable.com di cui TeamTime è completamente estranea.',
  'TeamTime non avrà accesso ai cookies collezionati da Airtable.com in nessun momento.',
];

export default function InformativaCookieScreen() {
  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.title}>Informativa di privacy e utilizzo di cookies da parte di servizi esterni</Text>
        <Text style={styles.text}>
          Procedendo con l&apos;accesso al database online confermi di aver letto e compreso quanto segue:
        </Text>
        {POINTS.map((point) => (
          <Text key={point} style={styles.text}>
            - {point}
          </Text>
        ))}
        <AppButton title="Indietro" onPress={() => router.back()} style={styles.button} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  content: { flexGrow: 1, justifyContent: 'center', padding: spacing.lg, gap: spacing.md },
  title: { fontSize: 18, fontWeight: '700', color: colors.text, textAlign: 'center' },
  text: { fontSize: 15, lineHeight: 22, color: colors.text, textAlign: 'center' },
  button: { marginTop: spacing.md, alignSelf: 'center', minWidth: 160 },
});
