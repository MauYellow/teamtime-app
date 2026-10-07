import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Alert, FlatList, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AppButton } from '@/components/AppButton';
import { BrandTitle } from '@/components/BrandTitle';
import { LogoHeader } from '@/components/LogoHeader';
import { activityLabel } from '@/lib/activities';
import { getActivities, getEmployeeLocale, getEmployeeName, type Activity } from '@/lib/storage';
import { colors, radius, spacing } from '@/theme';

// Home del dipendente (SPEC §4). Tappa 1: dati del dipendente e ultime attività.
// Le timbrature (Registra Entrata / Uscita) arrivano nella tappa 2.
export default function HomeScreen() {
  const [name, setName] = useState<string | null>(null);
  const [locale, setLocale] = useState<string | null>(null);
  const [activities, setActivities] = useState<Activity[]>([]);

  // Rilegge i dati ogni volta che la schermata torna visibile (es. dopo Accesso Dipendenti).
  useFocusEffect(
    useCallback(() => {
      setName(getEmployeeName());
      setLocale(getEmployeeLocale());
      setActivities(getActivities());
    }, [])
  );

  const comingSoon = () => Alert.alert('In arrivo', 'Le timbrature arrivano nella prossima tappa.');
  const lastIsEntry = activities[0]?.type === 'Entrata';

  if (!name) {
    return (
      <SafeAreaView style={styles.safe} edges={['top']}>
        <LogoHeader />
        <View style={styles.notRegistered}>
          <Text style={styles.hint}>Registra il tuo nome prima di scannerizzare il QR Code</Text>
          <AppButton title="Registrati come azienda" onPress={() => router.push('/tutorial')} />
          <AppButton title="Registrati come dipendente" onPress={() => router.push('/accesso')} />
          <AppButton title="Accedi al Tutorial" variant="outline" onPress={() => router.push('/tutorial')} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <LogoHeader />
      <FlatList
        data={activities}
        keyExtractor={(_, index) => String(index)}
        contentContainerStyle={styles.content}
        ListHeaderComponent={
          <View style={styles.header}>
            <View style={styles.card}>
              <Text style={styles.label}>Nome Dipendente</Text>
              <Text style={styles.value}>{name}</Text>
              <Text style={styles.label}>Azienda</Text>
              <Text style={styles.value}>{locale ?? '—'}</Text>
            </View>
            <View style={styles.buttons}>
              <AppButton title="Registra Entrata" onPress={comingSoon} style={styles.flex} />
              <AppButton title="Registra Uscita" onPress={comingSoon} disabled={!lastIsEntry} style={styles.flex} />
            </View>
            <Text style={styles.caption}>Scan QR Code per iniziare</Text>
            <BrandTitle text="Ultime Attività" style={styles.sectionTitle} />
          </View>
        }
        ListEmptyComponent={<Text style={styles.empty}>Ancora nessuna attività</Text>}
        renderItem={({ item }) => <Text style={styles.row}>{activityLabel(item)}</Text>}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  notRegistered: { flex: 1, justifyContent: 'center', padding: spacing.lg, gap: spacing.md },
  hint: { textAlign: 'center', color: colors.muted, fontSize: 15, marginBottom: spacing.sm },
  content: { padding: spacing.md, paddingBottom: spacing.xl },
  header: { gap: spacing.md, marginBottom: spacing.sm },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.card,
    padding: spacing.md,
    alignItems: 'center',
    gap: 2,
  },
  label: { fontSize: 13, color: colors.muted, marginTop: spacing.xs },
  value: { fontSize: 20, fontWeight: '700', color: colors.text, textAlign: 'center' },
  buttons: { flexDirection: 'row', gap: spacing.sm },
  flex: { flex: 1 },
  caption: { textAlign: 'center', fontStyle: 'italic', color: colors.muted, fontSize: 13, marginTop: -spacing.sm },
  sectionTitle: { marginTop: spacing.sm },
  empty: { textAlign: 'center', color: colors.muted, paddingVertical: spacing.lg },
  row: {
    paddingVertical: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
    color: colors.text,
    fontSize: 15,
  },
});
