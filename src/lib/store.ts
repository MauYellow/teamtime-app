import { Linking, Platform } from 'react-native';

import { ANDROID_PACKAGE, IOS_APP_STORE_ID } from '@/config';

// Link alla scheda dell'app sugli store (bottone "Aggiorna" della Splash).

export async function openStorePage() {
  const urls =
    Platform.OS === 'ios'
      ? [IOS_APP_STORE_ID ? `https://apps.apple.com/app/id${IOS_APP_STORE_ID}` : null]
      : [`market://details?id=${ANDROID_PACKAGE}`, `https://play.google.com/store/apps/details?id=${ANDROID_PACKAGE}`];
  for (const url of urls) {
    if (!url) continue;
    try {
      await Linking.openURL(url);
      return;
    } catch {
      // Prova il link successivo (es. Play Store non installato).
    }
  }
}
