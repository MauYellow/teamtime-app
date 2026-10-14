import { SymbolView } from 'expo-symbols';
import { Alert, Linking, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AppButton } from '@/components/AppButton';
import { LogoHeader } from '@/components/LogoHeader';
import { ManagerExit } from '@/components/ManagerExit';
import { EULA_URL, PRIVACY_URL } from '@/config';
import { isYes } from '@/lib/locali';
import { log } from '@/lib/log';
import { useSession } from '@/lib/session';
import { managementUrl, storeMethod } from '@/lib/subscription';
import { colors, radius, spacing } from '@/theme';

const MAX_ROWS_INFO =
  'È solo la capienza del registro, non un limite di utilizzo: l’app non smetterà mai di funzionare. Quando si ' +
  'raggiunge il numero massimo di righe, a ogni nuova timbratura vengono cancellate le più vecchie per fare spazio.';

/** Data AAAA-MM-GG (anche con l'ora dopo) → G/M/AAAA; altri formati restano come sono. */
function italianDate(value: string | undefined) {
  if (!value) return null;
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})/);
  return match ? `${Number(match[3])}/${Number(match[2])}/${match[1]}` : value;
}

/** "Si" / "Sì" / "yes" → pagato. */
function isPaid(value: string | undefined) {
  return ['si', 'sì', 'yes'].includes(value?.trim().toLowerCase() ?? '');
}

async function open(url: string) {
  try {
    await Linking.openURL(url);
  } catch (error) {
    log(`Il tuo piano: link non aperto ${String(error)}`);
  }
}

type Row = { label: string; value: string | null | undefined; info?: string };

// "Il tuo piano" (SPEC §8): dati dell'abbonamento del locale, senza acquisti.
export default function PianoScreen() {
  const { manager } = useSession();
  const method = storeMethod(manager);
  // "Fine prova" solo se l'abbonamento non risulta pagato (il portale la compila all'inizio della prova e la lascia).
  const trialEnd = isPaid(manager?.Pagato) ? null : italianDate(manager?.['Fine Prova']);
  const rows: Row[] = [
    { label: 'Azienda', value: manager?.['Ragione Sociale'] || manager?.Nome },
    { label: 'Nome QR Code', value: manager?.Locale },
    { label: 'Stato', value: manager?.Status },
    { label: 'Pagato', value: manager?.Pagato },
    { label: 'Metodo di pagamento', value: manager?.['Metodo di pagamento'] },
    { label: 'Fine prova', value: trialEnd },
    { label: 'GPS', value: isYes(manager?.GPS) ? 'Attivo' : 'Non attivo' },
    { label: 'Intercambio', value: isYes(manager?.Intercambio) ? 'Attivo' : 'Non attivo' },
    { label: 'Dipendenti massimi', value: manager?.['Max Dipendenti'] },
    {
      label: 'Righe massime del registro',
      value: manager?.['Max Rows'] ? String(manager['Max Rows']) : null,
      info: MAX_ROWS_INFO,
    },
  ];

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ManagerExit />
      <ScrollView contentContainerStyle={styles.content}>
        <LogoHeader variant="icon" />
        <Text style={styles.title}>Il tuo piano</Text>
        <View style={styles.card}>
          {rows
            .filter((row) => row.value)
            .map((row) => (
              <View key={row.label} style={styles.row}>
                <View style={styles.labelRow}>
                  <Text style={styles.label}>{row.label}</Text>
                  {row.info && (
                    <Pressable
                      onPress={() => Alert.alert(row.label, row.info)}
                      accessibilityRole="button"
                      accessibilityLabel={`Informazioni su ${row.label}`}
                      hitSlop={10}>
                      <SymbolView name={{ ios: 'info.circle', android: 'info' }} tintColor={colors.primary} size={17} />
                    </Pressable>
                  )}
                </View>
                <Text style={styles.value}>{row.value}</Text>
              </View>
            ))}
        </View>

        {method ? (
          <>
            {/* [develop 14/10/2026] Abbonamento dagli store: si gestisce e si disdice dallo store. */}
            <AppButton
              title="Gestisci abbonamento"
              variant="outline"
              onPress={async () => {
                // L'abbonamento si gestisce solo dallo store in cui è stato attivato.
                const phone = Platform.OS === 'ios' ? 'Apple' : 'Android';
                if (method !== phone) {
                  Alert.alert(
                    'Gestisci abbonamento',
                    method === 'Apple'
                      ? 'Il tuo abbonamento è stato attivato con un ID Apple: gestiscilo o disdicilo da iPhone o iPad, ' +
                          'in Impostazioni → il tuo nome → Abbonamenti.'
                      : 'Il tuo abbonamento è stato attivato con Google Play: gestiscilo o disdicilo da un telefono ' +
                          'Android, nell’app Play Store → profilo → Pagamenti e abbonamenti → Abbonamenti.'
                  );
                  return;
                }
                open(await managementUrl(manager));
              }}
            />
            <Text style={styles.note}>
              Puoi disdire il tuo abbonamento in qualsiasi momento dalle impostazioni degli abbonamenti dello store con
              cui l&apos;hai attivato (Apple o Google Play): resta attivo fino alla fine del periodo già pagato.
            </Text>
          </>
        ) : (
          <Text style={styles.note}>Puoi disdire il tuo abbonamento in qualsiasi momento.</Text>
        )}
        <Text style={styles.legal}>
          Usando TeamTime accetti i{' '}
          <Text style={styles.link} onPress={() => open(EULA_URL)} accessibilityRole="link">
            termini e condizioni (EULA)
          </Text>{' '}
          e confermi di aver letto l&apos;
          <Text style={styles.link} onPress={() => open(PRIVACY_URL)} accessibilityRole="link">
            informativa sulla privacy
          </Text>
          .
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.lg, paddingTop: 0, gap: spacing.md },
  title: { fontSize: 22, fontWeight: '700', color: colors.text, textAlign: 'center', marginTop: spacing.sm },
  card: { backgroundColor: colors.surface, borderRadius: radius.card, padding: spacing.md },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  labelRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, flexShrink: 1 },
  label: { color: colors.muted, fontSize: 15 },
  value: { color: colors.text, fontSize: 15, fontWeight: '600', flexShrink: 1, textAlign: 'right' },
  note: { textAlign: 'center', color: colors.muted, fontSize: 14, marginTop: spacing.sm },
  legal: { textAlign: 'center', color: colors.muted, fontSize: 13, lineHeight: 19 },
  link: { color: colors.primary, textDecorationLine: 'underline' },
});
