import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ManagerExit } from '@/components/ManagerExit';

import { useTimePicker } from '@/components/TimePicker';
import { formatTime } from '@/lib/activities';
import { log } from '@/lib/log';
import { fetchOpenPresenze, presenzaDate, setExitTime, type Presenza } from '@/lib/manager';
import { useSession } from '@/lib/session';
import { colors, radius, spacing } from '@/theme';

// Correggi Orari (SPEC §8): dipendenti ancora "al lavoro"; tocco sulla riga → orario di uscita.
export default function CorreggiScreen() {
  const { manager } = useSession();
  const table = manager?.Locale ?? '';
  const [rows, setRows] = useState<Presenza[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [now, setNow] = useState(() => formatTime(new Date()));
  const { pickTime, picker } = useTimePicker();

  const load = useCallback(async () => {
    if (!table) return;
    log('Modifica Orari: aggiornamento lista');
    setLoading(true);
    try {
      setRows(await fetchOpenPresenze(table));
    } catch (error) {
      log(`Modifica Orari: errore ${String(error)}`);
      Alert.alert('Errore!', 'Lista non caricata: controlla la connessione e trascina la lista in basso per riprovare.');
    } finally {
      setLoading(false);
    }
  }, [table]);

  // [miglioria] la lista si carica da sola all'apertura e si aggiorna trascinandola in basso: niente bottone "Aggiorna".
  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  // "Ora attuale" aggiornata ogni 30 secondi.
  useEffect(() => {
    const timer = setInterval(() => setNow(formatTime(new Date())), 30_000);
    return () => clearInterval(timer);
  }, []);

  const correct = async (row: Presenza) => {
    log(`Modifica Orario inizializzata per: ${row.id}`);
    const time = await pickTime(`Uscita di ${row.fields.Nome ?? 'dipendente'}`);
    if (!time) return;
    try {
      await setExitTime(table, row.id, time);
      log(`Modifica Orari: uscita ${formatTime(time)} per ${row.id}`);
      Alert.alert('Ben fatto!', 'Modifica effettuata con successo!');
      setRows((current) => current?.filter((item) => item.id !== row.id) ?? null);
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
        refreshing={loading && rows !== null}
        onRefresh={load}
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
      <View style={styles.footer}>
        <Text style={styles.now}>Ora attuale: {now}</Text>
        <Text style={styles.refreshHint}>Trascina la lista verso il basso per aggiornarla</Text>
      </View>
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
  footer: { padding: spacing.md, gap: spacing.xs },
  now: { textAlign: 'center', color: colors.text, fontWeight: '600' },
  refreshHint: { textAlign: 'center', color: colors.muted, fontSize: 12 },
});
