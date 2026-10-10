import { StyleSheet, Text, View } from 'react-native';

import { dayLabel, presenzaLabel } from '@/lib/history';
import { isAtWork, type Presenza } from '@/lib/manager';
import { colors, spacing } from '@/theme';

/** Una presenza letta da Airtable: "Ven 10/10   9:00 → 17:30 · 8,50 ore" (Home e Accesso Dipendenti). */
export function PresenzaRow({ record }: { record: Presenza }) {
  return (
    <View style={styles.row}>
      <Text style={styles.day}>{dayLabel(record)}</Text>
      <Text style={[styles.text, isAtWork(record) && styles.atWork]}>{presenzaLabel(record)}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.sm + 2,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  day: { width: 76, fontSize: 14, fontWeight: '600', color: colors.text },
  text: { flex: 1, fontSize: 15, color: colors.text },
  atWork: { color: colors.primary, fontWeight: '600' },
});
