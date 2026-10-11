import { router } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { log } from '@/lib/log';
import { updateSession } from '@/lib/session';
import { colors, spacing } from '@/theme';

/** Chiude l'area manager e torna all'area dipendente (Registro Online). */
export function managerLogout() {
  log('Area manager: uscita');
  updateSession({ manager: null });
  router.dismissTo('/registro');
}

/** Riga in cima a ogni scheda dell'area manager con il pulsante "Esci" a destra (al posto della scheda "Esci"). */
export function ManagerExit() {
  return (
    <View style={styles.bar}>
      <Pressable
        onPress={managerLogout}
        accessibilityRole="button"
        accessibilityLabel="Esci dall'area manager"
        hitSlop={10}
        style={({ pressed }) => [styles.button, pressed && styles.pressed]}>
        <SymbolView
          name={{ ios: 'rectangle.portrait.and.arrow.right', android: 'logout' }}
          tintColor={colors.primary}
          size={18}
        />
        <Text style={styles.text}>Esci</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: { flexDirection: 'row', justifyContent: 'flex-end', paddingHorizontal: spacing.md, paddingTop: spacing.xs },
  button: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, paddingVertical: spacing.xs },
  pressed: { opacity: 0.5 },
  text: { color: colors.primary, fontSize: 15, fontWeight: '700' },
});
