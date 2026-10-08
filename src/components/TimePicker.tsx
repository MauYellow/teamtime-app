import DateTimePicker, { DateTimePickerAndroid } from '@react-native-community/datetimepicker';
import { useCallback, useRef, useState } from 'react';
import { Modal, Platform, StyleSheet, Text, View } from 'react-native';

import { AppButton } from '@/components/AppButton';
import { colors, radius, spacing } from '@/theme';

/**
 * Selettore dell'orario ("Time_Input.Launch Picker" di Thunkable).
 * Uso: `const { pickTime, picker } = useTimePicker();` → `{picker}` nella schermata e `await pickTime(titolo)`,
 * che restituisce l'orario scelto oppure null se l'utente annulla.
 * Android: finestra nativa; iOS: rotella in un pannello con Annulla / Conferma.
 */
export function useTimePicker() {
  const [title, setTitle] = useState<string | null>(null);
  const [value, setValue] = useState(new Date());
  const resolver = useRef<((value: Date | null) => void) | null>(null);
  const pending = useRef<Date | null>(null);

  const pickTime = useCallback((title: string) => {
    const initial = new Date();
    if (Platform.OS === 'android') {
      return new Promise<Date | null>((resolve) => {
        DateTimePickerAndroid.open({
          value: initial,
          mode: 'time',
          is24Hour: true,
          title,
          onValueChange: (_, date) => resolve(date),
          onDismiss: () => resolve(null),
        });
      });
    }
    setValue(initial);
    return new Promise<Date | null>((resolve) => {
      resolver.current = resolve;
      pending.current = null;
      setTitle(title);
    });
  }, []);

  // Si risponde solo a pannello chiuso (onDismiss): un Alert aperto durante la chiusura non comparirebbe.
  const close = (result: Date | null) => {
    pending.current = result;
    setTitle(null);
  };
  const resolve = () => {
    resolver.current?.(pending.current);
    resolver.current = null;
  };

  const picker =
    Platform.OS === 'ios' ? (
      <Modal
        visible={title !== null}
        transparent
        animationType="slide"
        onRequestClose={() => close(null)}
        onDismiss={resolve}>
        <View style={styles.backdrop}>
          <View style={styles.sheet}>
            <Text style={styles.title}>{title}</Text>
            <DateTimePicker
              value={value}
              mode="time"
              display="spinner"
              locale="it-IT"
              onValueChange={(_, date) => setValue(date)}
            />
            <View style={styles.buttons}>
              <AppButton title="Annulla" variant="outline" onPress={() => close(null)} style={styles.flex} />
              <AppButton title="Conferma" onPress={() => close(value)} style={styles.flex} />
            </View>
          </View>
        </View>
      </Modal>
    ) : null;

  return { pickTime, picker };
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.35)' },
  sheet: {
    backgroundColor: colors.background,
    borderTopLeftRadius: radius.card,
    borderTopRightRadius: radius.card,
    padding: spacing.lg,
    paddingBottom: spacing.xl,
  },
  title: { fontSize: 17, fontWeight: '700', color: colors.text, textAlign: 'center' },
  buttons: { flexDirection: 'row', gap: spacing.sm },
  flex: { flex: 1 },
});
