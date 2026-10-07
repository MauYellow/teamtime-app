import { StyleSheet, Text, type StyleProp, type TextStyle } from 'react-native';

import { colors } from '@/theme';

type Props = { text: string; size?: number; style?: StyleProp<TextStyle> };

/**
 * Titolo con l'iniziale di ogni parola in rosso, come nell'app originale
 * ("Nome Dipendente", "Ultime Attività", "Registro Online").
 */
export function BrandTitle({ text, size = 22, style }: Props) {
  const words = text.split(' ');
  return (
    <Text style={[styles.title, { fontSize: size }, style]}>
      {words.map((word, index) => (
        <Text key={`${word}-${index}`}>
          <Text style={styles.initial}>{word.charAt(0)}</Text>
          {word.slice(1)}
          {index < words.length - 1 ? ' ' : ''}
        </Text>
      ))}
    </Text>
  );
}

const styles = StyleSheet.create({
  title: { fontWeight: '700', color: colors.text, textAlign: 'center' },
  initial: { color: colors.brand },
});
