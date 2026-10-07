import { router } from 'expo-router';

/** Apre Scan Result con il messaggio della timbratura (app variable "ErroreScan" di Thunkable). */
export function showScanResult(message: string) {
  router.push({ pathname: '/scan-result', params: { message } });
}

/** Torna alla Home (Scan Result e Log Error si aprono sopra la tab bar). */
export function backToHome() {
  if (router.canGoBack()) router.back();
  else router.replace('/home');
}
