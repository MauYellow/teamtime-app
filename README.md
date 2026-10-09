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

Con una development build (serve per provare la migrazione dei dati della vecchia app):
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
  "Ok" apre lo store e non lo chiede più; "Non ora" riparte da zero.

`ios/` e `android/` sono generate (Continuous Native Generation): non modificarle a mano, si configura tutto in `app.json`.

## Prima della pubblicazione (checklist)
- [ ] Bundle id iOS, package Android, numeri di versione/build: oggi in `app.json` ci sono segnaposto
      (`com.teamtime.dasostituire`). Vanno messi quelli dell'app attuale (chiedere a Maurizio).
- [x] `ANDROID_PACKAGE` (`com.gmail.mauriziopolverini89.teamtime`) e `IOS_APP_STORE_ID` (`6443974498`) in
      `src/config.ts`, presi dai link della tabella Supporto. Da confermare il bundle id iOS per `app.json`.
- [ ] **Provare la richiesta di recensione**: mettere `REVIEW_EVERY_SCANS = 2`, fare 2 timbrature, provare "Non ora"
      (deve ricomparire dopo altre 2) e "Ok" (apre lo store e non ricompare più); poi rimettere 20.
- [ ] Migrazione dei dati della vecchia app (`src/lib/thunkableMigration.ts`): verificare su Android e iOS con un
      telefono che ha la vecchia app installata (chiavi e formato dei valori del Local Storage di Thunkable).
- [ ] Icona 1024×1024 e splash definitivi.
- [ ] Da decidere insieme: log e Sentry (SPEC §15.3), aggiornamento automatico tramite store (§15.4), promemoria
      uscita e OneSignal nella vecchia app (§13), chiave Brevo dentro l'app (§15.5).
