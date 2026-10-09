import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Linking, Pressable, StyleSheet, Text, View } from 'react-native';

import { log } from '@/lib/log';
import { whatsappUrl } from '@/lib/registration';
import { clearSentCompanyRequest, getSentCompanyRequest, type SentCompanyRequest } from '@/lib/storage';
import { colors, radius, spacing } from '@/theme';

/** Avviso in Home dopo l'invio della richiesta di attivazione (Registra azienda), finché non viene chiuso. */
export function CompanyRequestBanner() {
  const [request, setRequest] = useState<SentCompanyRequest | null>(getSentCompanyRequest);

  useFocusEffect(
    useCallback(() => {
      setRequest(getSentCompanyRequest());
    }, [])
  );

  if (!request) return null;

  const close = () => {
    clearSentCompanyRequest();
    setRequest(null);
  };

  const openWhatsapp = () => {
    Linking.openURL(whatsappUrl(request)).catch((error) => log(`WhatsApp non aperto: ${String(error)}`));
  };

  return (
    <View style={styles.banner}>
      <View style={styles.flex}>
        <Text style={styles.title}>Form inviato</Text>
        <Text style={styles.text}>
          Verrai contattato a breve. In alternativa{' '}
          <Text style={styles.link} onPress={openWhatsapp} accessibilityRole="link">
            contattaci su WhatsApp
          </Text>
          .
        </Text>
      </View>
      <Pressable onPress={close} accessibilityRole="button" accessibilityLabel="Chiudi avviso" hitSlop={12}>
        <Text style={styles.close}>✕</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
    backgroundColor: '#EAF7EE',
    borderColor: colors.success,
    borderWidth: 1,
    borderRadius: radius.card,
    padding: spacing.md,
  },
  flex: { flex: 1 },
  title: { fontSize: 16, fontWeight: '700', color: colors.success },
  text: { fontSize: 14, color: colors.text, marginTop: 2, lineHeight: 20 },
  link: { color: colors.success, fontWeight: '700', textDecorationLine: 'underline' },
  close: { fontSize: 18, color: colors.muted },
});
