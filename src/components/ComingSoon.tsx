import { StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { BrandTitle } from '@/components/BrandTitle';
import { LogoHeader } from '@/components/LogoHeader';
import { colors, spacing } from '@/theme';

/** Segnaposto per le schermate non ancora ricreate (indica la tappa in cui arrivano). */
export function ComingSoon({ title, stage }: { title: string; stage: number }) {
  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <LogoHeader />
      <View style={styles.center}>
        <BrandTitle text={title} />
        <Text style={styles.text}>Questa schermata arriva nella tappa {stage}.</Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.md, padding: spacing.lg },
  text: { color: colors.muted, textAlign: 'center' },
});
