import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { StyleSheet } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

import { useForegroundWatcher } from '@/lib/foreground';
import { initSentry, wrapWithSentry } from '@/lib/sentry';
import { configurePurchases } from '@/lib/subscription';
import { colors } from '@/theme';

// All'avvio: Sentry (errori e crash) e abbonamento in-app (RevenueCat).
initSentry();
configurePurchases();

function RootLayout() {
  // Log del passaggio in background e del ritorno; esito dello scan non più attuale → Home (lib/foreground.ts).
  useForegroundWatcher();
  return (
    <GestureHandlerRootView style={styles.root}>
      <StatusBar style="dark" />
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.background } }}>
        <Stack.Screen name="index" options={{ animation: 'fade' }} />
        <Stack.Screen name="(tabs)" options={{ animation: 'fade' }} />
        <Stack.Screen name="tutorial" options={{ animation: 'fade' }} />
        <Stack.Screen name="scan-result" options={{ animation: 'fade', gestureEnabled: false }} />
        <Stack.Screen name="log-error" />
        <Stack.Screen name="informativa-cookie" />
        <Stack.Screen name="primi-passi" options={{ animation: 'fade' }} />
        <Stack.Screen name="registra-azienda" />
        <Stack.Screen name="prova-gratuita" />
        <Stack.Screen name="(manager)" options={{ gestureEnabled: false }} />
      </Stack>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
});

export default wrapWithSentry(RootLayout);
