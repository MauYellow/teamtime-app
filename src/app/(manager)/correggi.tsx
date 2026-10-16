import { useFocusEffect } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ManagerExit } from '@/components/ManagerExit';
import { useTimePicker } from '@/components/TimePicker';
import { formatTime } from '@/lib/activities';
import { log } from '@/lib/log';
import { fetchOpenPresenze, presenzaDate, setExitTime, type Presenza } from '@/lib/manager';
import { updateManagerRecord } from '@/lib/managerData';
import { useSession } from '@/lib/session';
import { colors, radius, spacing } from '@/theme';

// Correggi Orari (SPEC §8): dipendenti ancora "al lavoro"; tocco sulla riga → orario di uscita.
export default function CorreggiScreen() {
  const { manager } = useSession();
  const table = manager?.Locale ?? '';
  const [rows, setRows] = useState<Presenza[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [fetchedAt, setFetchedAt] = useState<Date | null>(null);
  const [failed, setFailed] = useState(false);
  const { pickTime, picker } = useTimePicker();

  const load = useCallback(async () => {
    if (!table) return;
    log('Modifica Orari: aggiornamento lista');
    setLoading(true);
    try {
      setRows(await fetchOpenPresenze());
      setFetchedAt(new Date());
      setFailed(false);
    } catch (error) {
      log(`Modifica Orari: errore ${String(error)}`);
      setFailed(true);
    } finally {
      setLoading(false);
    }
  }, [table]);

  // [miglioria] la lista si carica da sola all'apertura e dopo ogni modifica; si aggiorna anche con l'icona.
  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const correct = async (row: Presenza) => {
    log(`Modifica Orario inizializzata per: ${row.id}`);
    const time = await pickTime(`Uscita di ${row.fields.Nome ?? 'dipendente'}`);
    if (!time) return;
    try {
      const outcome = await setExitTime(table, row.id, time);
      if (outcome.status === 'gone') {
        Alert.alert('Presenza non trovata', 'Questa presenza è stata cancellata nel frattempo.');
        load();
        return;
      }
      updateManagerRecord(outcome.record);
      if (outcome.status === 'alreadyClosed') {
        Alert.alert('Uscita già registrata', `Nel frattempo è stata registrata l'uscita (${outcome.record.fields.Uscita ?? ''}).`);
        load();
        return;
      }
      log(`Modifica Orari: uscita ${formatTime(time)} per ${row.id}`);
      Alert.alert('Ben fatto!', 'Modifica effettuata con successo!');
      setRows((current) => current?.filter((item) => item.id !== row.id) ?? null);
      // Dopo ogni modifica la lista si rilegge (1 chiamata): eventuali altre uscite registrate nel frattempo.
      load();
    } catch (error) {
      log(`Modifica Orari: errore ${String(error)}`);
      Alert.alert('Errore!', `Contattare l'assistenza, Errore: ${String(error)}`);
    }
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ManagerExit />
      <View style={styles.header}>
        <Text style={styles.title}>Correzione Orari Dipendenti</Text>
        <Text style={styles.hint}>
          Questi dipendenti risultano ancora al lavoro, clicca sulla linea per impostare manualmente l&apos;orario di
          Uscita
        </Text>
      </View>
      <View style={styles.tableHeader}>
        <Text style={[styles.headerText, styles.flex]}>Nome / Data</Text>
        <Text style={styles.headerText}>Orario Entrata</Text>
      </View>
      <FlatList
        data={rows ?? []}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        ListEmptyComponent={
          loading ? (
            <ActivityIndicator color={colors.primary} style={styles.loader} />
          ) : (
            <Text style={styles.empty}>{rows ? 'Nessun dipendente risulta al lavoro' : ''}</Text>
          )
        }
        renderItem={({ item }) => (
          <Pressable
            onPress={() => correct(item)}
            accessibilityRole="button"
            style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}>
            <View style={styles.flex}>
              <Text style={styles.name}>{item.fields.Nome ?? 'Sconosciuto'}</Text>
              <Text style={styles.date}>
                {presenzaDate(item)}
                {item.fields['Giorno Corretto'] ? ` (giorno corretto: ${item.fields['Giorno Corretto']})` : ''}
              </Text>
            </View>
            <Text style={styles.time}>{item.fields.Entrata ?? '—'}</Text>
          </Pressable>
        )}
      />
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
            ? 'Connessione assente: lista non aggiornata'
            : fetchedAt
              ? `Aggiornato il ${fetchedAt.getDate()}/${fetchedAt.getMonth() + 1} alle ${formatTime(fetchedAt)}`
              : 'Caricamento…'}
        </Text>
      </Pressable>
      {picker}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  flex: { flex: 1 },
  header: { padding: spacing.md, gap: spacing.xs },
  hint: { textAlign: 'center', color: colors.muted, fontSize: 14 },
  title: { fontSize: 20, fontWeight: '700', color: colors.text, textAlign: 'center' },
  tableHeader: {
    flexDirection: 'row',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  headerText: { fontWeight: '700', color: colors.text },
  list: { paddingHorizontal: spacing.md, flexGrow: 1 },
  loader: { marginTop: spacing.xl },
  empty: { textAlign: 'center', color: colors.muted, marginTop: spacing.xl },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  rowPressed: { backgroundColor: colors.surface, borderRadius: radius.input },
  name: { fontSize: 16, fontWeight: '600', color: colors.text },
  date: { fontSize: 13, color: colors.muted, marginTop: 2 },
  time: { fontSize: 16, fontWeight: '600', color: colors.primary },
  refresh: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    padding: spacing.md,
  },
  updated: { fontSize: 12, color: colors.muted },
});
