// Metro con Sentry: aggiunge le informazioni per leggere gli errori sulle righe di codice originali.
const { getSentryExpoConfig } = require('@sentry/react-native/metro');

module.exports = getSentryExpoConfig(__dirname);
