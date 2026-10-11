import * as Haptics from 'expo-haptics';
import { useLocalSearchParams } from 'expo-router';
import LottieView from 'lottie-react-native';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AppButton } from '@/components/AppButton';
import { log } from '@/lib/log';
import { backToHome } from '@/lib/navigation';
import { sendReportToDeveloper } from '@/lib/report';
import { friendlyScanMessage, SCAN_MESSAGES } from '@/lib/scan';
import { colors, spacing } from '@/theme';

// Scan Result (SPEC §5): animazione "ok" se il messaggio contiene "correttamente", altrimenti "failed".
// [miglioria] In caso di errore: messaggio comprensibile e "Condividi cosa è successo con lo sviluppatore".
export default function ScanResultScreen() {
  const { message = '' } = useLocalSearchParams<{ message?: string }>();
  const ok = message.includes('correttamente');
  const canShare = !ok && message !== SCAN_MESSAGES.entryCancelled;
  const [sending, setSending] = useState(false);

  useEffect(() => {
    Haptics.notificationAsync(
      ok ? Haptics.NotificationFeedbackType.Success : Haptics.NotificationFeedbackType.Error
    ).catch(() => undefined);
  }, [ok]);

  const share = async () => {
    setSending(true);
    try {
      await sendReportToDeveloper(`Scan non riuscito: ${message}`);
      Alert.alert('Grazie!', 'Errore condiviso con lo sviluppatore, grazie per il tuo contributo.', [
        { text: 'Torna in Home', onPress: backToHome },
      ]);
    } catch (error) {
      log(`Invio report non riuscito: ${String(error)}`);
      Alert.alert('Invio non riuscito', 'Controlla la connessione e riprova.');
    } finally {
      setSending(false);
    }
  };

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.center}>
        <LottieView
          source={ok ? require('../../assets/lottie/scan-ok.json') : require('../../assets/lottie/scan-failed.json')}
          autoPlay
          loop={false}
          style={styles.animation}
        />
        <Text style={[styles.message, !ok && styles.error]}>{friendlyScanMessage(message)}</Text>
        <AppButton title="Torna in Home" onPress={backToHome} style={styles.button} />
        {canShare &&
          (sending ? (
            <ActivityIndicator color={colors.primary} />
          ) : (
            <Pressable onPress={share} accessibilityRole="button" hitSlop={8}>
              <Text style={styles.link}>Condividi cosa è successo con lo sviluppatore</Text>
            </Pressable>
          ))}
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
  link: { color: colors.primary, fontSize: 15, textAlign: 'center', textDecorationLine: 'underline' },
});
