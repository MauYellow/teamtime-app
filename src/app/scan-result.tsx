import * as Haptics from 'expo-haptics';
import { useLocalSearchParams } from 'expo-router';
import LottieView from 'lottie-react-native';
import { useEffect } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AppButton } from '@/components/AppButton';
import { backToHome } from '@/lib/navigation';
import { colors, spacing } from '@/theme';

// Scan Result (SPEC §5): animazione "ok" se il messaggio contiene "correttamente", altrimenti "failed".
export default function ScanResultScreen() {
  const { message = '' } = useLocalSearchParams<{ message?: string }>();
  const ok = message.includes('correttamente');

  useEffect(() => {
    Haptics.notificationAsync(
      ok ? Haptics.NotificationFeedbackType.Success : Haptics.NotificationFeedbackType.Error
    ).catch(() => undefined);
  }, [ok]);

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.center}>
        <LottieView
          source={ok ? require('../../assets/lottie/scan-ok.json') : require('../../assets/lottie/scan-failed.json')}
          autoPlay
          loop={false}
          style={styles.animation}
        />
        <Text style={[styles.message, !ok && styles.error]}>{message}</Text>
        <AppButton title="Torna in Home" onPress={backToHome} style={styles.button} />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.lg, gap: spacing.lg },
  animation: { width: 220, height: 220 },
  message: { fontSize: 18, fontWeight: '600', color: colors.text, textAlign: 'center' },
  error: { color: colors.error },
  button: { alignSelf: 'stretch' },
});
