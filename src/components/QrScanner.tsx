import { CameraView, useCameraPermissions, type BarcodeScanningResult } from 'expo-camera';
import * as Haptics from 'expo-haptics';
import { useCallback, useRef, useState } from 'react';
import { Alert, Linking, Modal, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { log } from '@/lib/log';
import { colors, radius, spacing } from '@/theme';

/**
 * Scansione del QR a schermo intero con la fotocamera posteriore ("scan barcode using camera on back" di Thunkable).
 * Uso: `const { scan, scanner } = useQrScanner();` → mettere `{scanner}` nella schermata e chiamare `await scan()`,
 * che restituisce il testo del QR oppure null se l'utente annulla.
 */
export function useQrScanner() {
  const [permission, requestPermission] = useCameraPermissions();
  const [visible, setVisible] = useState(false);
  const resolver = useRef<((value: string | null) => void) | null>(null);
  const pending = useRef<string | null>(null);

  const scan = useCallback(async () => {
    let status = permission;
    if (!status?.granted) status = await requestPermission();
    if (!status.granted) {
      log('Fotocamera: permesso negato');
      Alert.alert(
        'Fotocamera non disponibile',
        "Per scansionare il QR Code consenti a TeamTime l'uso della fotocamera nelle impostazioni del telefono.",
        [
          { text: 'Annulla', style: 'cancel' },
          { text: 'Impostazioni', onPress: () => Linking.openSettings() },
        ]
      );
      return null;
    }
    return new Promise<string | null>((resolve) => {
      resolver.current = resolve;
      pending.current = null;
      setVisible(true);
    });
  }, [permission, requestPermission]);

  const resolve = useCallback(() => {
    resolver.current?.(pending.current);
    resolver.current = null;
  }, []);

  const close = useCallback(
    (value: string | null) => {
      pending.current = value;
      setVisible(false);
      // Su iOS si aspetta la chiusura del Modal (onDismiss): un Alert aperto durante l'animazione non comparirebbe.
      if (Platform.OS !== 'ios') resolve();
    },
    [resolve]
  );

  const scanner = (
    <ScannerModal visible={visible} onScanned={(value) => close(value)} onCancel={() => close(null)} onDismiss={resolve} />
  );
  return { scan, scanner };
}

type ModalProps = {
  visible: boolean;
  onScanned: (value: string) => void;
  onCancel: () => void;
  onDismiss: () => void;
};

function ScannerModal({ visible, onScanned, onCancel, onDismiss }: ModalProps) {
  // La fotocamera può segnalare lo stesso QR più volte: si accetta solo la prima lettura.
  const done = useRef(false);

  const handleScan = (result: BarcodeScanningResult) => {
    if (done.current || !result.data) return;
    done.current = true;
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => undefined);
    onScanned(result.data.trim());
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="fullScreen"
      onShow={() => (done.current = false)}
      onRequestClose={onCancel}
      onDismiss={onDismiss}>
      <View style={styles.container}>
        {visible && (
          <CameraView
            style={StyleSheet.absoluteFill}
            facing="back"
            barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
            onBarcodeScanned={handleScan}
          />
        )}
        <SafeAreaView style={styles.overlay}>
          <Text style={styles.hint}>Inquadra il QR Code della tua azienda</Text>
          <View style={styles.frame} />
          <Pressable accessibilityRole="button" onPress={onCancel} style={styles.cancel}>
            <Text style={styles.cancelText}>Annulla</Text>
          </Pressable>
        </SafeAreaView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
  overlay: { flex: 1, alignItems: 'center', justifyContent: 'space-between', paddingVertical: spacing.xl },
  hint: {
    color: colors.white,
    fontSize: 17,
    fontWeight: '600',
    textAlign: 'center',
    paddingHorizontal: spacing.lg,
    textShadowColor: 'rgba(0,0,0,0.6)',
    textShadowRadius: 4,
  },
  frame: { width: 250, height: 250, borderWidth: 3, borderColor: colors.white, borderRadius: radius.card },
  cancel: {
    backgroundColor: colors.primary,
    borderRadius: radius.button,
    paddingVertical: spacing.sm + 6,
    paddingHorizontal: spacing.xl,
  },
  cancelText: { color: colors.white, fontSize: 17, fontWeight: '600' },
});
