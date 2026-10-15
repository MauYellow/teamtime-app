import { Pressable, ScrollView, StyleSheet, Text } from 'react-native';

import { companyName } from '@/lib/history';
import { colors, spacing } from '@/theme';

/** Scheda scelta: "all" = tutte le aziende insieme, altrimenti il nome della tabella. */
export type CompanyTab = 'all' | string;

/**
 * Schede "Tutte" + una per azienda (Intercambio, SPEC §16.1). Solo se il dipendente ha presenze in più di un'azienda:
 * altrimenti non compare niente.
 */
export function CompanyTabs({
  tables,
  selected,
  onSelect,
}: {
  tables: string[];
  selected: CompanyTab;
  onSelect: (tab: CompanyTab) => void;
}) {
  if (tables.length < 2) return null;
  const tabs: { key: CompanyTab; label: string }[] = [
    { key: 'all', label: 'Tutte' },
    ...tables.map((table) => ({ key: table, label: companyName(table) })),
  ];
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row}>
      {tabs.map((tab) => {
        const active = tab.key === selected;
        return (
          <Pressable
            key={tab.key}
            onPress={() => onSelect(tab.key)}
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
            style={({ pressed }) => [styles.tab, active && styles.active, pressed && styles.pressed]}>
            <Text style={[styles.label, active && styles.activeLabel]} numberOfLines={1}>
              {tab.label}
            </Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

/** Scheda valida tra quelle disponibili (un'azienda sparita torna a "Tutte"). */
export function validTab(tab: CompanyTab, tables: string[]): CompanyTab {
  return tab === 'all' || tables.includes(tab) ? tab : 'all';
}

const styles = StyleSheet.create({
  row: { gap: spacing.sm, paddingVertical: spacing.xs },
  tab: {
    paddingVertical: spacing.xs + 2,
    paddingHorizontal: spacing.md,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    maxWidth: 200,
  },
  active: { backgroundColor: colors.primary, borderColor: colors.primary },
  pressed: { opacity: 0.6 },
  label: { fontSize: 14, fontWeight: '600', color: colors.text },
  activeLabel: { color: colors.white },
});
