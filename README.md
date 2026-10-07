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

## Provare l'app
Con Expo Go (telefono, stessa rete Wi-Fi del PC):
```bash
npx expo start --go
```
Con una development build (serve per provare la migrazione dei dati della vecchia app):
```bash
npm run android          # Windows/Mac
npm run ios              # solo Mac
```
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
- `APP_VERSION` (oggi 4.0): confrontata con la riga `Versione` della tabella **Versione** su Airtable. Se su Airtable
  c'è un numero maggiore, la Splash blocca e chiede di aggiornare. Alzare la riga su Airtable **solo dopo** che la nuova
  versione è sugli store.
- Le altre variabili (Telegram, recensioni) si leggono dalla tabella Versione cercando la colonna `Descrizione`.

`ios/` e `android/` sono generate (Continuous Native Generation): non modificarle a mano, si configura tutto in `app.json`.

## Prima della pubblicazione (checklist)
- [ ] Bundle id iOS, package Android, numeri di versione/build: oggi in `app.json` ci sono segnaposto
      (`com.teamtime.dasostituire`). Vanno messi quelli dell'app attuale (chiedere a Maurizio).
- [ ] `ANDROID_PACKAGE` e `IOS_APP_STORE_ID` in `src/config.ts`.
- [ ] Migrazione dei dati della vecchia app (`src/lib/thunkableMigration.ts`): verificare su Android e iOS con un
      telefono che ha la vecchia app installata (chiavi e formato dei valori del Local Storage di Thunkable).
- [ ] Icona 1024×1024 e splash definitivi.
