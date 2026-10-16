import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, Image, Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AppButton } from '@/components/AppButton';
import { LogoHeader } from '@/components/LogoHeader';
import { APP_VERSION } from '@/config';
import { log } from '@/lib/log';
import { fetchSupportItems, type SupportItem } from '@/lib/supporto';
import { colors, radius, spacing } from '@/theme';

// Supporto (SPEC §9): voci dalla tabella Supporto; il tocco apre il link per iOS o per Android.
export default function SupportoScreen() {
  const [items, setItems] = useState<SupportItem[] | null>(null);
  const [failed, setFailed] = useState(false);

  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    fetchSupportItems()
      .then((list) => !cancelled && setItems(list))
      .catch((error) => {
        log(`Supporto: errore caricamento ${String(error)}`);
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [attempt]);

  const retry = () => {
    setFailed(false);
    setAttempt((value) => value + 1);
  };

  const open = async (item: SupportItem) => {
    if (!item.url) return;
    try {
      await Linking.openURL(item.url);
    } catch (error) {
      log(`Supporto: link non aperto ${String(error)}`);
      Alert.alert('Link non disponibile', 'Non è stato possibile aprire il collegamento.');
    }
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <LogoHeader />
      {failed ? (
        <View style={styles.center}>
          <Text style={styles.muted}>Contenuti non disponibili: controlla la connessione.</Text>
          <AppButton title="Riprova" variant="outline" onPress={retry} />
        </View>
      ) : items === null ? (
        <ActivityIndicator color={colors.primary} style={styles.loader} />
      ) : (
        <FlatList
          data={items}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          renderItem={({ item }) => (
            <Pressable
              onPress={() => open(item)}
              accessibilityRole="link"
              style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}>
              {item.image ? (
                <Image source={{ uri: item.image }} style={styles.image} />
              ) : (
                <View style={styles.image} />
              )}
              <View style={styles.texts}>
                <Text style={styles.title}>{item.title}</Text>
                {item.subtitle ? <Text style={styles.subtitle}>{item.subtitle}</Text> : null}
              </View>
              <Text style={styles.chevron}>›</Text>
            </Pressable>
          )}
          ListFooterComponent={<Text style={styles.version}>versione {APP_VERSION}</Text>}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  center: { flex: 1, justifyContent: 'center', padding: spacing.lg, gap: spacing.md },
  muted: { color: colors.muted, textAlign: 'center' },
  loader: { marginTop: spacing.xl },
  list: { padding: spacing.md },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  rowPressed: { backgroundColor: colors.surface, borderRadius: radius.input },
  image: { width: 44, height: 44 },
  texts: { flex: 1 },
  title: { fontSize: 16, fontWeight: '700', color: colors.text },
  subtitle: { fontSize: 14, color: colors.muted, marginTop: 2 },
  chevron: { fontSize: 24, color: colors.muted },
  version: { textAlign: 'center', color: colors.muted, marginTop: spacing.lg },
});
