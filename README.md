# TeamTime

Riscrittura in Expo (React Native + TypeScript + Expo Router) dell'app Thunkable **TeamTime – Registro Presenze**.
Si pubblica come **aggiornamento** delle app esistenti. Specifica: `../SPEC.md`; regole di progetto: `../CLAUDE.md`.

L'app legge e scrive sulla base Airtable **Presenze** (`appOwBv51ihqoT7Cx`), la stessa del portale www.teamtimeapp.it:
i formati dei dati devono restare identici a quelli dell'app Thunkable (vedi SPEC §1).

## Requisiti
- Node.js 20+ e npm
- Android: Android Studio (SDK + emulatore), `JAVA_HOME` su un JDK 17+.
- iOS: un Mac con Xcode e CocoaPods.

## Prima configurazione (su ogni computer)
```bash
npm install
cp .env.example .env     # poi inserisci i valori in .env
```
`.env` è escluso da git: va copiato a mano su ogni computer (Windows e Mac).

| Variabile | Cosa serve |
|---|---|
| `EXPO_PUBLIC_AIRTABLE_TOKEN` | token Airtable con lettura e scrittura sulla base Presenze |
| `EXPO_PUBLIC_GEOCODE_API_KEY` | chiave geocode.maps.co (indirizzo del GPS) |
| `EXPO_PUBLIC_BREVO_API_KEY` | chiave Brevo (registrazione azienda) |
| `EXPO_PUBLIC_TELEGRAM_BOT_KEY` / `EXPO_PUBLIC_TELEGRAM_CHANNEL_ID` | log su Telegram |
| `EXPO_PUBLIC_REVENUECAT_IOS_KEY` / `EXPO_PUBLIC_REVENUECAT_ANDROID_KEY` | chiavi pubbliche RevenueCat (abbonamento in-app) |

Le variabili `EXPO_PUBLIC_*` finiscono dentro l'app (come le chiavi nell'app Thunkable). Le altre (es. password di prova)
restano sul PC.

## Provare l'app
Con Expo Go (telefono, stessa rete Wi-Fi del PC):
```bash
npx expo start --go
```
Usa sempre `--go`: senza, Expo mostra il QR per la development build e Expo Go risponde "Something went wrong".
Telefono e PC devono potersi vedere in rete: le reti ospiti (hotel, uffici, "Guest") di solito lo impediscono. In quel
caso collega il PC all'hotspot del telefono e rilancia il comando. Il tunnel (`npx expo start --go --tunnel`) è
un'alternativa, ma su questo PC non si è collegato.

Pacchetto: `app.config.ts` aggiunge `.dev` al pacchetto Android e al bundle id iOS (nome "TeamTime Dev") in tutte le
build tranne il profilo EAS `production` (`APP_VARIANT=production`). Così la build di sviluppo convive con l'app degli
store. Per provare la migrazione dei dati della vecchia app serve invece il pacchetto vero: `APP_VARIANT=production`.

Per provare l'abbonamento in-app serve il pacchetto vero (Google e Apple collegano gli abbonamenti al pacchetto):
profilo EAS `development-store` (development build con `APP_VARIANT=production`, firmata con la chiave di caricamento).
Sostituisce sul telefono l'app degli store: prima disinstallala, poi reinstallala dallo store a fine prove.
```bash
eas build -p android --profile development-store
```
Gli acquisti dei tester (sandbox) non scrivono su Airtable: arriva solo il riepilogo su Telegram (SPEC §17).

Con una development build:
```bash
npm run android          # Windows/Mac
npm run ios              # solo Mac
```
Emulatore Android su questo PC: l'antivirus AVG intercetta le connessioni HTTPS (certificato "AVG Web/Mail Shield") e
l'emulatore non lo riconosce, quindi Airtable non risponde ("Trust anchor for certification path not found"). Prova sul
telefono, oppure escludi l'emulatore dalla scansione HTTPS di AVG.

Tabella di test per le timbrature: **teamtime031** (QR di prova = testo `teamtime031`; Intercambio = yes, GPS = no).
Non usare le tabelle dei clienti per le prove.

Area manager di prova: Registro Online con `teamtime031` (password in `.env`, variabile
`PASSWORD_DASHBOARD_TEAMTIME031`, solo per le prove sul PC: non finisce nell'app).

Su Windows la build nativa fallisce se il percorso del progetto è lungo: compila da una copia in un percorso corto
(es. `C:\tt`) oppure usa le build EAS.

## Controlli
```bash
npm run typecheck
npx expo lint
npx expo-doctor
```

## Configurazione
Valori che possono cambiare: `src/config.ts`.
- `APP_VERSION` (oggi 4.0): confrontata con la riga `Versione` della scheda della nuova app nel file
  "TeamTime - App Settings", pubblicata sul web come CSV (`SETTINGS_CSV_URL`). Se nel foglio c'è un numero maggiore, la Splash blocca e chiede di aggiornare. Alzarlo **solo
  dopo** che la nuova versione è sugli store. **La prima scheda (vecchia app) non va mai toccata**, in particolare non
  alzare "Versione App": bloccherebbe i telefoni che non possono installare la nuova app (SPEC §15.1).
- `REVIEW_EVERY_SCANS` (20): ogni 20 timbrature riuscite (entrate + uscite), al ritorno in Home, compare "Ti piace TeamTime?".
  "Recensisci" apre lo store e non lo chiede più; "Non ora" e "Segnala un problema" ripartono da zero.

`ios/` e `android/` sono generate (Continuous Native Generation): non modificarle a mano, si configura tutto in `app.json`.

## Prima della pubblicazione (checklist)
- [ ] Variabili `EXPO_PUBLIC_*` per le build EAS `preview`/`production`: `.env` non viene caricato su EAS (è escluso da
      git), quindi vanno create su expo.dev (ambiente `production`, `eas env:list --environment production` per
      controllare). Le development build non ne hanno bisogno: il JavaScript arriva da Metro sul PC, che legge `.env`.
- [ ] **Prezzi Android con l'IVA aggiunta** (Google aggiunge l'IVA al prezzo inserito, Apple no): correggere in Play
      Console il prezzo finale dell'Italia dei tre abbonamenti (SPEC §17).
- [x] GPS e Intercambio nelle Impostazioni solo per chi ha l'abbonamento dagli store; "Apple"/"Android" in
      `Metodo di pagamento` all'acquisto. L'app non scrive mai "Stripe" e non tocca il flusso Stripe (SPEC §17).
- [ ] Abbonamento in-app: provare con una development build (acquisto sandbox = nessuna scrittura su Airtable, solo
      Telegram). Su Android gli acquisti funzionano solo con il pacchetto vero (`APP_VARIANT=production`) e un account
      tra i tester delle licenze.
- [x] Package Android `com.gmail.mauriziopolverini89.teamtime` e `versionCode` 93 in `app.json` (Thunkable in produzione:
      versionCode 92, versione 3.001, 12/10/2026). A ogni nuova build per lo store alzare `versionCode` di 1.
- [x] Bundle id iOS uguale al package Android (`com.gmail.mauriziopolverini89.teamtime`). Numero di build iOS: non
      impostato (= 1), va bene perché la versione 4.0.0 è nuova; alzarlo a ogni nuova build della stessa versione.
- [x] Chiave di firma Android: la stessa di Thunkable (alias `androidkey`, SHA-1 `6A:E4:B6:AA:…:E9:2B`) in
      `credentials/android-upload.keystore` + `credentials.json` (esclusi da git, usati dal profilo EAS `production`).
      Tenerne una copia di sicurezza fuori dal PC: senza, non si possono più pubblicare aggiornamenti Android.
- [x] `ANDROID_PACKAGE` (`com.gmail.mauriziopolverini89.teamtime`) e `IOS_APP_STORE_ID` (`6443974498`) in
      `src/config.ts`, presi dai link della tabella Supporto. Da confermare il bundle id iOS per `app.json`.
- [ ] **Provare la richiesta di recensione**: mettere `REVIEW_EVERY_SCANS = 2`, fare 2 timbrature, provare "Non ora" e
      "Segnala un problema" (devono ricomparire dopo altre 2) e "Recensisci" (apre lo store e non ricompare più); poi
      rimettere 20.
- [ ] Migrazione dei dati della vecchia app (`src/lib/thunkableMigration.ts`): verificare su Android e iOS con un
      telefono che ha la vecchia app installata (chiavi e formato dei valori del Local Storage di Thunkable).
- [ ] Icona 1024×1024 e splash definitivi.
- [ ] Da decidere insieme: log e Sentry (SPEC §15.3), aggiornamento automatico tramite store (§15.4), promemoria
      uscita e OneSignal nella vecchia app (§13), chiave Brevo dentro l'app (§15.5).
