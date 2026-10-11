import { SymbolView } from 'expo-symbols';
import { Alert, Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';

import { colors, radius, spacing } from '@/theme';

type Props = {
  title: string;
  /** Spiegazione mostrata toccando l'icona "i" (se assente, niente icona). */
  info?: string;
  style?: StyleProp<ViewStyle>;
};

/** Intestazione di sezione su sfondo rosso chiaro, con l'icona "i" che apre una spiegazione. */
export function SectionHeader({ title, info, style }: Props) {
  return (
    <View style={[styles.row, style]}>
      <Text style={styles.title} accessibilityRole="header">
        {title}
      </Text>
      {info && (
        <Pressable
          onPress={() => Alert.alert(title, info)}
          accessibilityRole="button"
          accessibilityLabel={`Informazioni su ${title}`}
          hitSlop={12}>
          <SymbolView name={{ ios: 'info.circle', android: 'info' }} tintColor={colors.primary} size={20} />
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
    backgroundColor: '#FDECEE',
    borderRadius: radius.input,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 2,
  },
  title: { flex: 1, fontSize: 18, fontWeight: '700', color: colors.text },
});
