import { SymbolView } from 'expo-symbols';
import { useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ManagerExit } from '@/components/ManagerExit';
import { PresenceCalendar, type CalendarMonth } from '@/components/PresenceCalendar';
import { formatTime } from '@/lib/activities';
import { loadManagerData, useManagerData } from '@/lib/managerData';
import { useSession } from '@/lib/session';
import { colors, spacing } from '@/theme';

// Calendario (SPEC §8) [miglioria 11/10/2026]: calendario mensile nell'app al posto della vista web di Airtable.
// Pallino con il numero di presenze per giorno (rosso se c'è un turno non chiuso di un giorno passato); tocco sul giorno
// → elenco dei dipendenti. Le presenze sono quelle lette all'ingresso nell'area manager (lib/managerData.ts), le
// stesse del Conteggio: cambiare mese non costa chiamate; l'icona rilegge tutto.
// [17/11/2026] Il calendario è in components/PresenceCalendar.tsx, in comune con il Calendario del dipendente.
export default function CalendarioScreen() {
  const { manager } = useSession();
  const table = manager?.Locale ?? '';
  const now = new Date();
  const [month, setMonth] = useState<CalendarMonth>({ year: now.getFullYear(), month: now.getMonth() });
  const { records, loading, failed, fetchedAt } = useManagerData();
  const load = () => loadManagerData(table, true);

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ManagerExit />
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.title}>Calendario presenze</Text>
        <PresenceCalendar
          records={records}
          loading={loading}
          month={month}
          onMonthChange={setMonth}
          rowTitle={(record) => record.fields.Nome?.trim() || 'Sconosciuto'}>
          <Pressable
            onPress={load}
            disabled={loading}
            accessibilityRole="button"
            accessibilityLabel="Aggiorna"
            hitSlop={12}
            style={styles.refresh}>
            {loading ? (
              <ActivityIndicator size="small" color={colors.primary} />
            ) : (
              <SymbolView name={{ ios: 'arrow.clockwise', android: 'refresh' }} tintColor={colors.primary} size={18} />
            )}
            <Text style={styles.updated}>·</Text>
            <Text style={styles.updated}>
              {failed
                ? 'Connessione assente: dati non aggiornati'
                : fetchedAt
                  ? `Aggiornato alle ${formatTime(fetchedAt)}`
                  : 'Caricamento…'}
            </Text>
          </Pressable>
        </PresenceCalendar>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.md, paddingBottom: spacing.xl, gap: spacing.sm },
  title: { fontSize: 20, fontWeight: '700', color: colors.text, textAlign: 'center' },
  refresh: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.xs },
  updated: { fontSize: 12, color: colors.muted },
});
