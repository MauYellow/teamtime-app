import { StyleSheet, Text, View } from 'react-native';

import { dayLabel, presenzaLabel } from '@/lib/history';
import { isAtWork, type Presenza } from '@/lib/manager';
import { colors, spacing } from '@/theme';

/**
 * Una presenza letta da Airtable: "Ven 10/10   9:00 → 17:30 · 8,50 ore" (Home e Accessi). Nella scheda "Tutte"
 * dell'Intercambio, sotto, il nome dell'azienda.
 */
export function PresenzaRow({ record, company }: { record: Presenza; company?: string }) {
  return (
    <View style={styles.row}>
      <Text style={styles.day}>{dayLabel(record)}</Text>
      <View style={styles.flex}>
        <Text style={[styles.text, isAtWork(record) && styles.atWork]}>{presenzaLabel(record)}</Text>
        {company ? (
          <Text style={styles.company} numberOfLines={1}>
            {company}
          </Text>
        ) : null}
      </View>
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
  flex: { flex: 1 },
  text: { fontSize: 15, color: colors.text },
  atWork: { color: colors.primary, fontWeight: '600' },
  company: { fontSize: 12, color: colors.muted, marginTop: 1 },
});
