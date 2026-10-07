import { Image, Pressable, StyleSheet, View } from 'react-native';

import { colors, spacing } from '@/theme';

type Props = {
  /** Logo con la scritta "Team Time" (default) o solo l'orologio con la cravatta. */
  variant?: 'name' | 'icon';
  onPress?: () => void;
};

/** Logo in alto al centro, come in tutte le schermate dell'app originale. */
export function LogoHeader({ variant = 'name', onPress }: Props) {
  const image =
    variant === 'name' ? (
      <Image source={require('../../assets/images/logo-name.png')} style={styles.name} resizeMode="contain" />
    ) : (
      <Image source={require('../../assets/images/logo.png')} style={styles.icon} resizeMode="contain" />
    );
  return (
    <View style={styles.container}>
      {onPress ? (
        <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel="TeamTime">
          {image}
        </Pressable>
      ) : (
        image
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    paddingVertical: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  name: { width: 220, height: 110 },
  icon: { width: 96, height: 96 },
});
