import { Alert } from 'react-native';

// Alert nativi in forma di Promise, per scrivere i flussi come nei blocchi Thunkable ("Show" → "wasConfirmed").

type ConfirmOptions = { cancel?: string; confirm?: string; destructive?: boolean };

/** Alert con due bottoni: true se l'utente conferma. */
export function confirmAlert(title: string, message: string, options: ConfirmOptions = {}) {
  return new Promise<boolean>((resolve) => {
    Alert.alert(
      title,
      message,
      [
        { text: options.cancel ?? 'Annulla', style: 'cancel', onPress: () => resolve(false) },
        {
          text: options.confirm ?? 'Conferma',
          style: options.destructive ? 'destructive' : 'default',
          onPress: () => resolve(true),
        },
      ],
      { cancelable: true, onDismiss: () => resolve(false) }
    );
  });
}

/** Alert con un solo bottone "OK": si risolve quando viene chiuso. */
export function infoAlert(title: string, message: string) {
  return new Promise<void>((resolve) => {
    Alert.alert(title, message, [{ text: 'OK', onPress: () => resolve() }], {
      cancelable: true,
      onDismiss: () => resolve(),
    });
  });
}
