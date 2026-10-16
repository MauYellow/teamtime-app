import * as Network from 'expo-network';
import { router } from 'expo-router';
import LottieView from 'lottie-react-native';
import { useEffect, useState } from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AppButton } from '@/components/AppButton';
import { APP_VERSION, SPLASH_MAX_ATTEMPTS, SPLASH_MIN_DURATION_MS, SPLASH_RETRY_DELAY_MS } from '@/config';
import { loadCached, removeCache } from '@/lib/cache';
import { fetchLocale, isYes, localeCacheKey } from '@/lib/locali';
import { requestLocationPermission } from '@/lib/location';
import { log } from '@/lib/log';
import { updateSession } from '@/lib/session';
import { isUpdateRequired } from '@/lib/version';
import { syncSubscription } from '@/lib/subscription';
import { fetchAppSettings, type AppSettings } from '@/lib/settings';
import { getEmployeeLocale, getEmployeeName, isFirstAccess } from '@/lib/storage';
import { openStorePage } from '@/lib/store';
import { sendTelegram, startupErrorTelegramText } from '@/lib/telegram';
import { migrateThunkableData } from '@/lib/thunkableMigration';
import { colors, spacing } from '@/theme';

const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/** Ripete un caricamento da Airtable come l'originale: fino a 5 tentativi, 10 secondi tra uno e l'altro. */
async function withRetries<T>(what: string, load: () => Promise<T>, onRetry: (attempt: number) => void) {
  for (let attempt = 1; ; attempt++) {
    try {
      return await load();
    } catch (error) {
      log(`Errore caricamento ${what} (tentativo ${attempt}): ${String(error)}`);
      sendTelegram(startupErrorTelegramText(what, attempt, String(error)));
      if (attempt >= SPLASH_MAX_ATTEMPTS) throw error;
      onRetry(attempt + 1);
      await wait(SPLASH_RETRY_DELAY_MS);
    }
  }
}

type Phase =
  | { kind: 'loading'; message: string }
  | { kind: 'offline' }
  | { kind: 'update' }
  | { kind: 'failed' };

// Splash (SPEC §3): migrazione dati vecchia app, variabili, controllo versione, info locale, permesso GPS.
export default function SplashScreen() {
  const [phase, setPhase] = useState<Phase>({ kind: 'loading', message: 'Caricamento in corso..' });
  const [runId, setRunId] = useState(0);

  useEffect(() => {
    let cancelled = false;
    const show = (next: Phase) => !cancelled && setPhase(next);
    const retryMessage = (attempt: number) =>
      show({
        kind: 'loading',
        message: `Tentativo numero ${attempt} di accesso in corso, se necessario riavviare l'app..`,
      });

    async function start() {
      const startedAt = Date.now();
      log('Inizializzazione App');
      await migrateThunkableData();
      log(`Dati sul telefono: nome ${getEmployeeName() ? 'presente' : 'assente'}, azienda ${getEmployeeLocale() ?? 'assente'}`);

      const network = await Network.getNetworkStateAsync();
      if (network.isConnected === false) {
        show({ kind: 'offline' });
        return;
      }

      try {
        // Impostazioni dal Google Sheet (gratuito, niente Airtable). Se il foglio non risponde si usa l'ultima copia
        // salvata; se non c'è, si prosegue senza controllo versione: non è un motivo per bloccare le timbrature.
        const settings = await loadCached<AppSettings | null>('variabili', fetchAppSettings, async () => {
          try {
            return await fetchAppSettings();
          } catch (error) {
            log(`Impostazioni non disponibili: ${String(error)}`);
            return null;
          }
        });
        if (!settings) removeCache('variabili');
        updateSession({ settings });
        log(`Variabili caricate: versione pubblicata ${settings?.latestVersion ?? 'n.d.'}`);
        if (isUpdateRequired(APP_VERSION, settings?.latestVersion)) {
          show({ kind: 'update' });
          return;
        }

        const localeName = getEmployeeLocale();
        if (localeName) {
          show({ kind: 'loading', message: 'Caricamento informazioni azienda..' });
          const load = () => fetchLocale(localeName);
          const key = localeCacheKey(localeName);
          // I dati del locale (GPS, Intercambio, Max Rows) si rileggono a ogni apertura, così un cambio su Airtable vale
          // subito; la copia salvata serve solo se Airtable non risponde.
          const locale = await loadCached(key, load, () =>
            withRetries('info locale', load, retryMessage)
          );
          // Un locale non trovato non si ricorda: al prossimo avvio si riprova.
          if (!locale) removeCache(key);
          updateSession({ locale });
          // Locali che pagano dagli store: stato dell'abbonamento aggiornato su Airtable (senza aspettare).
          syncSubscription(locale);
          log(locale ? `Locale riconosciuto: ${localeName}` : `Locale ${localeName} non trovato in Locali Approvati`);
          if (isYes(locale?.GPS)) await requestLocationPermission();
        }
      } catch {
        show({ kind: 'failed' });
        return;
      }

      await wait(Math.max(0, SPLASH_MIN_DURATION_MS - (Date.now() - startedAt)));
      if (!cancelled) router.replace(isFirstAccess() ? '/tutorial' : '/home');
    }

    start();
    return () => {
      cancelled = true;
    };
  }, [runId]);

  // Offline: si riparte da soli quando torna la connessione.
  useEffect(() => {
    if (phase.kind !== 'offline') return;
    const subscription = Network.addNetworkStateListener((state) => {
      if (state.isConnected) {
        setPhase({ kind: 'loading', message: 'Caricamento in corso..' });
        setRunId((id) => id + 1);
      }
    });
    return () => subscription.remove();
  }, [phase.kind]);

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.center}>
        <Image source={require('../../assets/images/logo-name.png')} style={styles.logo} resizeMode="contain" />
        <Text style={styles.author}>
          <Text style={styles.initial}>M</Text>aurizio <Text style={styles.initial}>P</Text>olverini
        </Text>
        <LottieView source={require('../../assets/lottie/splash.json')} autoPlay loop style={styles.animation} />

        {phase.kind === 'loading' && <Text style={styles.message}>{phase.message}</Text>}
        {phase.kind === 'offline' && (
          <Text style={styles.message}>Per utilizzare TeamTime è necessario collegarsi a internet</Text>
        )}
        {phase.kind === 'failed' && (
          <View style={styles.block}>
            <Text style={styles.message}>Riavviare l&apos;app, se il problema persiste contattare l&apos;assistenza</Text>
            <AppButton title="Riprova" onPress={() => setRunId((id) => id + 1)} />
          </View>
        )}
        {phase.kind === 'update' && (
          <View style={styles.block}>
            <Text style={styles.message}>È disponibile una nuova versione di TeamTime</Text>
            <AppButton title="Aggiorna" onPress={openStorePage} />
          </View>
        )}
      </View>
      <Text style={styles.version}>versione {APP_VERSION}</Text>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: spacing.lg },
  logo: { width: 260, height: 146 },
  author: { fontSize: 15, fontWeight: '700', color: colors.text, marginTop: -spacing.sm },
  initial: { color: colors.brand },
  animation: { width: 240, height: 200, marginVertical: spacing.md },
  message: { fontSize: 16, color: colors.text, textAlign: 'center' },
  block: { alignItems: 'center', gap: spacing.md },
  version: { textAlign: 'center', color: colors.muted, marginBottom: spacing.md },
});
