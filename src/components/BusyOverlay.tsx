import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

import { colors, radius, spacing } from '@/theme';

/**
 * Caricamento sopra la schermata con il passo in corso (Loading_Icon e Label2 della Home di Thunkable).
 * È una vista e non un Modal: su iOS un Alert aperto mentre un Modal si chiude andrebbe perso.
 */
export function BusyOverlay({ text }: { text: string | null }) {
  if (text === null) return null;
  return (
    <View style={styles.backdrop} accessibilityViewIsModal>
      <View style={styles.box}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={styles.text}>{text}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(0,0,0,0.35)',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 10,
  },
  box: {
    backgroundColor: colors.background,
    borderRadius: radius.card,
    padding: spacing.lg,
    minWidth: 220,
    alignItems: 'center',
    gap: spacing.md,
  },
  text: { color: colors.text, fontSize: 15, textAlign: 'center' },
});
