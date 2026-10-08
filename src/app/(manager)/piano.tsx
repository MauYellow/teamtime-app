import { Linking, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { BrandTitle } from '@/components/BrandTitle';
import { LogoHeader } from '@/components/LogoHeader';
import { EULA_URL, PORTAL_URL, PRIVACY_URL } from '@/config';
import { log } from '@/lib/log';
import { useSession } from '@/lib/session';
import { colors, radius, spacing } from '@/theme';

/** Data AAAA-MM-GG → G/M/AAAA (altri formati restano come sono). */
function italianDate(value: string | undefined) {
  if (!value) return null;
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})/);
  return match ? `${Number(match[3])}/${Number(match[2])}/${match[1]}` : value;
}

async function open(url: string) {
  try {
    await Linking.openURL(url);
  } catch (error) {
    log(`Il tuo piano: link non aperto ${String(error)}`);
  }
}

// "Il tuo piano" (SPEC §8): sostituisce "Piani" senza acquisti in-app. L'abbonamento lo paga l'azienda dal portale
// (regola 3.1.3(c) di Apple per i servizi alle aziende): nessun bottone di acquisto né link di pagamento.
export default function PianoScreen() {
  const { manager } = useSession();
  const rows: [string, string | null | undefined][] = [
    ['Azienda', manager?.['Ragione Sociale'] || manager?.Nome],
    ['Nome QR Code', manager?.Locale],
    ['Stato', manager?.Status],
    ['Pagato', manager?.Pagato],
    ['Fine prova', italianDate(manager?.['Fine Prova'])],
    ['Dipendenti massimi', manager?.['Max Dipendenti']],
    ['Righe massime del registro', manager?.['Max Rows'] ? String(manager['Max Rows']) : null],
  ];

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScrollView contentContainerStyle={styles.content}>
        <LogoHeader variant="icon" />
        <BrandTitle text="Il Tuo Piano" style={styles.title} />
        <View style={styles.card}>
          {rows
            .filter(([, value]) => value)
            .map(([label, value]) => (
              <View key={label} style={styles.row}>
                <Text style={styles.label}>{label}</Text>
                <Text style={styles.value}>{value}</Text>
              </View>
            ))}
        </View>
        <Text style={styles.note}>
          Per le altre funzioni di gestione accedi al gestionale web.
        </Text>
        <Pressable onPress={() => open(PORTAL_URL)} accessibilityRole="link">
          <Text style={styles.link}>Apri il gestionale web</Text>
        </Pressable>
        <View style={styles.legal}>
          <Pressable onPress={() => open(PRIVACY_URL)} accessibilityRole="link">
            <Text style={styles.link}>Informativa sulla privacy</Text>
          </Pressable>
          <Pressable onPress={() => open(EULA_URL)} accessibilityRole="link">
            <Text style={styles.link}>Termini e condizioni (EULA)</Text>
          </Pressable>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.lg, paddingTop: 0, gap: spacing.md },
  title: { marginTop: spacing.sm },
  card: { backgroundColor: colors.surface, borderRadius: radius.card, padding: spacing.md },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: spacing.md,
    paddingVertical: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  label: { color: colors.muted, fontSize: 15 },
  value: { color: colors.text, fontSize: 15, fontWeight: '600', flexShrink: 1, textAlign: 'right' },
  note: { textAlign: 'center', color: colors.muted, fontSize: 14 },
  link: { textAlign: 'center', color: colors.primary, fontSize: 15, textDecorationLine: 'underline' },
  legal: { gap: spacing.sm, marginTop: spacing.md },
});
