import { ActivityIndicator, Pressable, StyleSheet, Text, type StyleProp, type ViewStyle } from 'react-native';

import { colors, radius, spacing } from '@/theme';

type Props = {
  title: string;
  onPress: () => void;
  disabled?: boolean;
  loading?: boolean;
  /** "primary" = rosso pieno (default); "outline" = bordo rosso. Disattivato = grigio, come in Thunkable. */
  variant?: 'primary' | 'outline';
  style?: StyleProp<ViewStyle>;
};

/** Bottone rosso arrotondato, come quelli dell'app Thunkable ma più moderno. */
export function AppButton({ title, onPress, disabled, loading, variant = 'primary', style }: Props) {
  const outline = variant === 'outline';
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: disabled || loading }}
      disabled={disabled || loading}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        outline && styles.outline,
        pressed && (outline ? styles.outlinePressed : styles.pressed),
        (disabled || loading) && styles.disabled,
        style,
      ]}>
      {loading ? (
        <ActivityIndicator color={outline ? colors.primary : colors.white} />
      ) : (
        <Text style={[styles.text, outline && styles.outlineText, disabled && styles.disabledText]}>{title}</Text>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    backgroundColor: colors.primary,
    borderRadius: radius.button,
    paddingVertical: spacing.sm + 6,
    paddingHorizontal: spacing.lg,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 50,
  },
  pressed: { backgroundColor: colors.primaryPressed },
  outline: { backgroundColor: colors.white, borderWidth: 1.5, borderColor: colors.primary },
  outlinePressed: { backgroundColor: colors.surface },
  disabled: { backgroundColor: colors.inputBackground, borderColor: colors.border },
  text: { color: colors.white, fontSize: 17, fontWeight: '600', textAlign: 'center' },
  outlineText: { color: colors.primary },
  disabledText: { color: colors.disabled },
});
