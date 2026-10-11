import { SymbolView } from 'expo-symbols';
import { useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ManagerExit } from '@/components/ManagerExit';

import { formatTime } from '@/lib/activities';
import { formatEmployeeHours, localDay, today } from '@/lib/history';
import { hoursOf, isAtWork, type Presenza } from '@/lib/manager';
import { loadManagerData, useManagerData } from '@/lib/managerData';
import { useSession } from '@/lib/session';
import { colors, radius, spacing } from '@/theme';

const WEEKDAYS = ['L', 'M', 'M', 'G', 'V', 'S', 'D'];

/** Giorno della presenza "AAAA-MM-GG": vale il Giorno Corretto se il manager l'ha impostato (come nel Conteggio). */
function presenceDay(record: Presenza) {
  const day = localDay(record);
  const corrected = Number(record.fields['Giorno Corretto']);
  return corrected >= 1 && corrected <= 31 ? `${day.slice(0, 8)}${String(corrected).padStart(2, '0')}` : day;
}

function dayKey(year: number, month: number, day: number) {
  return `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function capitalize(text: string) {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/** "9:00" → minuti, per ordinare le presenze del giorno. */
function entryMinutes(record: Presenza) {
  const [hours, minutes] = (record.fields.Entrata ?? '').split(/[:.]/).map(Number);
  return Number.isFinite(hours) && Number.isFinite(minutes) ? hours * 60 + minutes : 24 * 60;
}

// Calendario (SPEC §8) [miglioria 11/10/2026]: calendario mensile nell'app al posto della vista web di Airtable.
// Pallino con il numero di presenze per giorno (rosso se c'è un turno non chiuso di un giorno passato); tocco sul giorno
// → elenco dei dipendenti. Le presenze sono quelle lette all'ingresso nell'area manager (lib/managerData.ts), le
// stesse del Conteggio: cambiare mese non costa chiamate; l'icona rilegge tutto.
export default function CalendarioScreen() {
  const { manager } = useSession();
  const table = manager?.Locale ?? '';
  const now = new Date();
  const [month, setMonth] = useState({ year: now.getFullYear(), month: now.getMonth() });
  const [selected, setSelected] = useState(today());
  const { records, loading, failed, fetchedAt } = useManagerData();
  const load = () => loadManagerData(table, true);

  /** Presenze raggruppate per giorno. */
  const byDay = useMemo(() => {
    const map = new Map<string, Presenza[]>();
    for (const record of records ?? []) {
      const key = presenceDay(record);
      map.set(key, [...(map.get(key) ?? []), record]);
    }
    for (const list of map.values()) list.sort((a, b) => entryMinutes(a) - entryMinutes(b));
    return map;
  }, [records]);

  const todayKey = today();

  // Griglia del mese, settimane che iniziano di lunedì.
  const first = new Date(month.year, month.month, 1);
  const daysInMonth = new Date(month.year, month.month + 1, 0).getDate();
  const offset = (first.getDay() + 6) % 7;
  const cells: (number | null)[] = [
    ...Array.from({ length: offset }, () => null),
    ...Array.from({ length: daysInMonth }, (_, index) => index + 1),
  ];
  while (cells.length % 7 !== 0) cells.push(null);

  const monthLabel = capitalize(first.toLocaleDateString('it-IT', { month: 'long', year: 'numeric' }));
  // Mese passato senza nessuna presenza: probabilmente già cancellato dal limite di righe del registro.
  const monthPrefix = dayKey(month.year, month.month, 1).slice(0, 8);
  const emptyPastMonth =
    records !== null &&
    ![...byDay.keys()].some((key) => key.startsWith(monthPrefix)) &&
    dayKey(month.year, month.month, daysInMonth) < todayKey;

  /** Cambio mese: si seleziona oggi se è in quel mese, altrimenti il primo giorno. */
  const changeMonth = (delta: number) => {
    const date = new Date(month.year, month.month + delta, 1);
    const next = { year: date.getFullYear(), month: date.getMonth() };
    setMonth(next);
    const isCurrent = next.year === now.getFullYear() && next.month === now.getMonth();
    setSelected(isCurrent ? todayKey : dayKey(next.year, next.month, 1));
  };

  const selectedRecords = byDay.get(selected) ?? [];
  const selectedDate = new Date(`${selected}T12:00:00`);
  const selectedLabel = capitalize(
    selectedDate.toLocaleDateString('it-IT', { weekday: 'long', day: 'numeric', month: 'long' })
  );

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ManagerExit />
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.title}>Calendario presenze</Text>

        <View style={styles.monthBar}>
          <Pressable onPress={() => changeMonth(-1)} accessibilityRole="button" accessibilityLabel="Mese precedente" hitSlop={12}>
            <SymbolView name={{ ios: 'chevron.left', android: 'chevron_left' }} tintColor={colors.primary} size={22} />
          </Pressable>
          <Text style={styles.monthLabel}>{monthLabel}</Text>
          <Pressable onPress={() => changeMonth(1)} accessibilityRole="button" accessibilityLabel="Mese successivo" hitSlop={12}>
            <SymbolView name={{ ios: 'chevron.right', android: 'chevron_right' }} tintColor={colors.primary} size={22} />
          </Pressable>
        </View>

        <View style={styles.grid}>
          {WEEKDAYS.map((day, index) => (
            <Text key={index} style={styles.weekday}>
              {day}
            </Text>
          ))}
          {cells.map((day, index) => {
            if (day === null) return <View key={`vuoto-${index}`} style={styles.cell} />;
            const key = dayKey(month.year, month.month, day);
            const list = byDay.get(key) ?? [];
            const open = list.some((record) => isAtWork(record) && key < todayKey);
            const isSelected = key === selected;
            return (
              <Pressable
                key={key}
                onPress={() => setSelected(key)}
                accessibilityRole="button"
                accessibilityLabel={`${day}, ${list.length} presenze${open ? ', turni non chiusi' : ''}`}
                style={styles.cell}>
                <View style={[styles.day, key === todayKey && styles.today, isSelected && styles.selectedDay]}>
                  <Text style={[styles.dayText, isSelected && styles.selectedText]}>{day}</Text>
                </View>
                {list.length > 0 ? (
                  <View style={[styles.badge, open && styles.badgeOpen]}>
                    <Text style={styles.badgeText}>{list.length}</Text>
                  </View>
                ) : (
                  <View style={styles.badgeEmpty} />
                )}
              </Pressable>
            );
          })}
        </View>

        <View style={styles.legend}>
          <View style={styles.dot} />
          <Text style={styles.legendText}>Turni corretti</Text>
          <View style={[styles.dot, styles.badgeOpen]} />
          <Text style={styles.legendText}>Turni non chiusi</Text>
        </View>

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

        <View style={styles.dayHeader}>
          <Text style={styles.dayTitle}>{selectedLabel}</Text>
        </View>
        {records === null ? (
          loading ? <ActivityIndicator color={colors.primary} style={styles.loader} /> : null
        ) : emptyPastMonth ? (
          <Text style={styles.empty}>
            Nessuna presenza in questo mese: il registro conserva solo le presenze più recenti.
          </Text>
        ) : selectedRecords.length === 0 ? (
          <Text style={styles.empty}>Nessuna presenza in questo giorno</Text>
        ) : (
          selectedRecords.map((record) => {
            const atWork = isAtWork(record);
            const stillOpen = atWork && selected < todayKey;
            return (
              <View key={record.id} style={styles.presence}>
                <Text style={styles.name} numberOfLines={1}>
                  {record.fields.Nome?.trim() || 'Sconosciuto'}
                </Text>
                <Text style={[styles.times, atWork && styles.atWork, stillOpen && styles.openText]}>
                  {record.fields.Entrata ?? '—'} →{' '}
                  {atWork
                    ? stillOpen
                      ? 'non chiuso'
                      : 'al lavoro'
                    : `${record.fields.Uscita ?? '—'} · ${formatEmployeeHours(hoursOf(record))} h`}
                </Text>
              </View>
            );
          })
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.md, paddingBottom: spacing.xl, gap: spacing.sm },
  title: { fontSize: 20, fontWeight: '700', color: colors.text, textAlign: 'center' },
  monthBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#FDECEE',
    borderRadius: radius.input,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 2,
  },
  monthLabel: { fontSize: 18, fontWeight: '700', color: colors.text },
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  weekday: {
    width: '14.2857%',
    textAlign: 'center',
    color: colors.muted,
    fontSize: 12,
    fontWeight: '700',
    paddingVertical: spacing.xs,
  },
  cell: { width: '14.2857%', alignItems: 'center', paddingVertical: spacing.xs, gap: 2 },
  day: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
  today: { borderWidth: 1.5, borderColor: colors.primary },
  selectedDay: { backgroundColor: colors.primary },
  dayText: { fontSize: 15, color: colors.text },
  selectedText: { color: colors.white, fontWeight: '700' },
  badge: {
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    paddingHorizontal: 4,
    backgroundColor: colors.success,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeOpen: { backgroundColor: colors.error },
  badgeEmpty: { height: 18 },
  dot: { width: 12, height: 12, borderRadius: 6, backgroundColor: colors.success },
  badgeText: { color: colors.white, fontSize: 11, fontWeight: '700' },
  legend: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.xs },
  legendText: { fontSize: 12, color: colors.muted, marginRight: spacing.sm },
  refresh: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.xs },
  updated: { fontSize: 12, color: colors.muted },
  dayHeader: {
    backgroundColor: '#FDECEE',
    borderRadius: radius.input,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 2,
    marginTop: spacing.sm,
  },
  dayTitle: { fontSize: 17, fontWeight: '700', color: colors.text },
  loader: { marginVertical: spacing.md },
  empty: { textAlign: 'center', color: colors.muted, paddingVertical: spacing.md },
  presence: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.sm + 2,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  name: { flex: 1, fontSize: 15, fontWeight: '600', color: colors.text },
  times: { fontSize: 15, color: colors.text },
  atWork: { color: colors.primary, fontWeight: '600' },
  openText: { color: colors.error },
});
