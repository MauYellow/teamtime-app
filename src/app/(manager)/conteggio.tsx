import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AppButton } from '@/components/AppButton';
import { confirmAlert } from '@/lib/dialogs';
import { log } from '@/lib/log';
import {
  availableMonths,
  employeeTotals,
  fetchAllPresenze,
  formatHours,
  recordsOfMonth,
  sendTotalsMail,
  shareExcelReport,
  type Month,
  type Presenza,
} from '@/lib/manager';
import { useSession } from '@/lib/session';
import { colors, radius, spacing } from '@/theme';

// Conteggio (SPEC §8): scelta del mese, poi Conteggio Veloce, Invia Mail, Report Excel.
export default function ConteggioScreen() {
  const { manager } = useSession();
  const table = manager?.Locale ?? '';
  const [records, setRecords] = useState<Presenza[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [month, setMonth] = useState<Month | null>(null);
  const [showTotals, setShowTotals] = useState(false);
  const [busy, setBusy] = useState<'mail' | 'excel' | null>(null);

  // Tutte le righe del locale (al massimo Max Rows): si leggono una volta all'apertura.
  useEffect(() => {
    if (!table) return;
    let cancelled = false;
    fetchAllPresenze(table)
      .then((list) => !cancelled && setRecords(list))
      .catch((error) => {
        log(`Conteggio: errore caricamento ${String(error)}`);
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [table, attempt]);

  const months = useMemo(() => (records ? availableMonths(records) : []), [records]);
  const monthRecords = useMemo(() => (records && month ? recordsOfMonth(records, month) : []), [records, month]);
  const totals = useMemo(() => employeeTotals(monthRecords), [monthRecords]);
  const grandTotal = totals.reduce((sum, item) => sum + item.hours, 0);
  const atWork = totals.reduce((sum, item) => sum + item.atWork, 0);

  const choose = (item: Month) => {
    setMonth(item);
    setShowTotals(false);
  };

  const retry = () => {
    setFailed(false);
    setAttempt((value) => value + 1);
  };

  /** Come il portale: se qualcuno risulta ancora al lavoro, le sue ore di quel giorno non sono conteggiate. */
  const confirmIfAtWork = useCallback(async () => {
    if (atWork === 0) return true;
    return confirmAlert(
      'Attenzione',
      `${atWork === 1 ? 'Un dipendente risulta' : `${atWork} presenze risultano`} ancora "al lavoro" in questo mese: ` +
        'quelle ore non saranno conteggiate. Puoi correggerle da "Correggi Orari". Vuoi continuare?',
      { confirm: 'Continua' }
    );
  }, [atWork]);

  const sendMail = async () => {
    if (!manager || !month) return;
    if (!manager.Mail) {
      Alert.alert('Mail mancante', "Per questa azienda non è registrata una mail. Contatta l'assistenza.");
      return;
    }
    if (!(await confirmIfAtWork())) return;
    if (!(await confirmAlert('Invia Mail', `Inviare il riepilogo di ${month.label} a ${manager.Mail}?`, { confirm: 'Invia' })))
      return;
    setBusy('mail');
    try {
      await sendTotalsMail(manager, month, totals);
      log(`Conteggio: mail richiesta per ${month.key}`);
      Alert.alert('Mail inviata', `Il riepilogo arriverà a ${manager.Mail} entro pochi minuti.`);
    } catch (error) {
      log(`Conteggio: errore mail ${String(error)}`);
      Alert.alert('Errore', 'Mail non inviata: controlla la connessione e riprova.');
    } finally {
      setBusy(null);
    }
  };

  const excel = async () => {
    if (!month) return;
    if (!(await confirmIfAtWork())) return;
    setBusy('excel');
    try {
      await shareExcelReport(table, month, totals);
      log(`Conteggio: report Excel ${month.key}`);
    } catch (error) {
      log(`Conteggio: errore report ${String(error)}`);
      Alert.alert('Errore', 'Report non creato. Riprova o contatta l’assistenza.');
    } finally {
      setBusy(null);
    }
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.title}>Seleziona qui sotto uno dei mesi disponibili per effettuare il conteggio:</Text>
        {failed ? (
          <View style={styles.block}>
            <Text style={styles.muted}>Presenze non caricate: controlla la connessione.</Text>
            <AppButton title="Riprova" variant="outline" onPress={retry} />
          </View>
        ) : records === null ? (
          <ActivityIndicator color={colors.primary} style={styles.loader} />
        ) : months.length === 0 ? (
          <Text style={styles.muted}>Nessuna presenza registrata.</Text>
        ) : (
          <View style={styles.months}>
            {months.map((item) => (
              <Pressable
                key={item.key}
                onPress={() => choose(item)}
                accessibilityRole="button"
                accessibilityState={{ selected: item.key === month?.key }}
                style={[styles.month, item.key === month?.key && styles.monthSelected]}>
                <Text style={[styles.monthText, item.key === month?.key && styles.monthTextSelected]}>{item.label}</Text>
              </Pressable>
            ))}
          </View>
        )}

        <Text style={styles.chosenLabel}>Mese scelto:</Text>
        <Text style={styles.chosen}>{month ? month.label : 'Ancora nessun mese selezionato'}</Text>

        <View style={styles.buttons}>
          <AppButton
            title="Conteggio Veloce"
            onPress={() => setShowTotals(true)}
            disabled={!month}
            style={styles.button}
          />
          <AppButton
            title="Invia Mail"
            onPress={sendMail}
            disabled={!month || busy !== null}
            loading={busy === 'mail'}
            style={styles.button}
          />
          <AppButton
            title="Report Excel"
            onPress={excel}
            disabled={!month || busy !== null}
            loading={busy === 'excel'}
            style={styles.button}
          />
        </View>

        {showTotals && month && (
          <View style={styles.totals}>
            {totals.map((item) => (
              <View key={item.name} style={styles.totalRow}>
                <Text style={styles.totalName}>{item.name}</Text>
                <Text style={styles.totalHours}>
                  {formatHours(item.hours)} ore{item.atWork > 0 ? ' *' : ''}
                </Text>
              </View>
            ))}
            <View style={[styles.totalRow, styles.grandTotal]}>
              <Text style={styles.totalName}>Totale</Text>
              <Text style={styles.totalHours}>{formatHours(grandTotal)} ore</Text>
            </View>
            {atWork > 0 && <Text style={styles.note}>* risulta ancora al lavoro in almeno un giorno</Text>}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.md, gap: spacing.sm },
  title: { fontSize: 16, color: colors.text, textAlign: 'center' },
  block: { gap: spacing.sm },
  muted: { color: colors.muted, textAlign: 'center' },
  loader: { marginVertical: spacing.lg },
  months: { borderRadius: radius.card, overflow: 'hidden', backgroundColor: colors.surface },
  month: {
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  monthSelected: { backgroundColor: colors.primary },
  monthText: { fontSize: 16, color: colors.text },
  monthTextSelected: { color: colors.white, fontWeight: '700' },
  chosenLabel: { textAlign: 'center', color: colors.muted, marginTop: spacing.sm },
  chosen: { textAlign: 'center', fontWeight: '700', fontSize: 16, color: colors.text },
  buttons: { gap: spacing.sm, marginTop: spacing.sm },
  button: { paddingHorizontal: spacing.sm },
  totals: { marginTop: spacing.md, borderRadius: radius.card, backgroundColor: colors.surface, padding: spacing.md },
  totalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  grandTotal: { borderBottomWidth: 0 },
  totalName: { fontSize: 15, color: colors.text, flex: 1 },
  totalHours: { fontSize: 15, fontWeight: '700', color: colors.text },
  note: { fontSize: 12, color: colors.muted, marginTop: spacing.xs },
});
