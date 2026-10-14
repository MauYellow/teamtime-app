import { router } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { useCallback, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AppButton } from '@/components/AppButton';
import { ManagerExit } from '@/components/ManagerExit';
import { formatTime } from '@/lib/activities';
import { confirmAlert } from '@/lib/dialogs';
import { log } from '@/lib/log';
import {
  availableMonths,
  employeeTotals,
  formatHours,
  recordsOfMonth,
  sendTotalsMail,
  shareExcelReport,
  emailExcelReport,
  type Month,
} from '@/lib/manager';
import { loadManagerData, useManagerData } from '@/lib/managerData';
import { useSession } from '@/lib/session';
import { colors, radius, spacing } from '@/theme';

// Conteggio (SPEC §8): scelta del mese, poi Conteggio Veloce, Invia Mail, Report Excel. Le presenze sono quelle
// lette all'ingresso nell'area manager (lib/managerData.ts), le stesse del Calendario.
export default function ConteggioScreen() {
  const { manager } = useSession();
  const table = manager?.Locale ?? '';
  const { records, failed, loading, fetchedAt } = useManagerData();
  const [month, setMonth] = useState<Month | null>(null);
  const [showTotals, setShowTotals] = useState(false);
  const [busy, setBusy] = useState<'mail' | 'excel' | null>(null);
  const scrollRef = useRef<ScrollView>(null);

  const months = useMemo(() => (records ? availableMonths(records) : []), [records]);
  const monthRecords = useMemo(() => (records && month ? recordsOfMonth(records, month) : []), [records, month]);
  const totals = useMemo(() => employeeTotals(monthRecords), [monthRecords]);
  const grandTotal = totals.reduce((sum, item) => sum + item.hours, 0);
  const atWork = totals.reduce((sum, item) => sum + item.atWork, 0);

  const choose = (item: Month) => {
    setMonth(item);
    setShowTotals(false);
  };

  const retry = () => loadManagerData(table, true);

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

  /** Conteggio Veloce: con turni "al lavoro" avvisa prima, poi mostra i totali e scorre fino a vederli. */
  const quickCount = async () => {
    if (!month) return;
    if (!(await confirmIfAtWork())) return;
    setShowTotals(true);
    setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 100);
  };

  const sendMail = async () => {
    if (!manager || !month) return;
    if (!manager.Mail) {
      Alert.alert('Mail mancante', "Per questa azienda non è registrata una mail. Contatta l'assistenza.");
      return;
    }
    if (!(await confirmIfAtWork())) return;
    if (!(await confirmAlert('Mail Conteggio Veloce', `Inviare il riepilogo di ${month.label} a ${manager.Mail}?`, { confirm: 'Invia' })))
      return;
    setBusy('mail');
    try {
      await sendTotalsMail(month, totals);
      log(`Conteggio: mail richiesta per ${month.key}`);
      Alert.alert('Mail inviata', `Il riepilogo arriverà a ${manager.Mail} entro pochi minuti.`);
    } catch (error) {
      log(`Conteggio: errore mail ${String(error)}`);
      Alert.alert('Errore', 'Mail non inviata: controlla la connessione e riprova.');
    } finally {
      setBusy(null);
    }
  };

  /** "Ricevi Report Excel Completo": scelta tra mail e telefono. */
  const chooseExcelDestination = () =>
    new Promise<'mail' | 'phone' | null>((resolve) =>
      Alert.alert(
        'Report Excel completo',
        'Come vuoi ricevere il report?',
        [
          { text: 'Invia alla mail', onPress: () => resolve('mail') },
          { text: 'Scarica sul telefono', onPress: () => resolve('phone') },
          { text: 'Annulla', style: 'cancel', onPress: () => resolve(null) },
        ],
        { cancelable: true, onDismiss: () => resolve(null) }
      )
    );

  const excel = async () => {
    if (!month) return;
    if (!(await confirmIfAtWork())) return;
    const destination = await chooseExcelDestination();
    if (!destination) return;
    setBusy('excel');
    try {
      if (destination === 'mail') {
        const opened = manager?.Mail ? await emailExcelReport(table, month, totals, manager.Mail) : false;
        if (!opened) {
          // Nessun account Mail sul telefono (o mail del locale mancante): si usa il pannello di condivisione.
          setBusy(null);
          Alert.alert(
            'App Mail non disponibile',
            'Sul telefono non risulta un account Mail configurato: scegli tu dove inviarlo (Gmail, Outlook, WhatsApp...).'
          );
          await shareExcelReport(table, month, totals);
        }
      } else {
        await shareExcelReport(table, month, totals);
      }
      log(`Conteggio: report Excel ${month.key} (${destination})`);
    } catch (error) {
      log(`Conteggio: errore report ${String(error)}`);
      Alert.alert('Errore', 'Report non creato. Riprova o contatta l’assistenza.');
    } finally {
      setBusy(null);
    }
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ManagerExit />
      <ScrollView ref={scrollRef} contentContainerStyle={styles.content}>
        <Text style={styles.title}>Seleziona qui sotto uno dei mesi disponibili per effettuare il conteggio:</Text>
        {failed ? (
          <View style={styles.block}>
            <Text style={styles.muted}>Presenze non caricate: controlla la connessione.</Text>
            <AppButton title="Riprova" variant="outline" onPress={retry} />
          </View>
        ) : records === null || (loading && !records) ? (
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

        <Pressable
          onPress={retry}
          disabled={loading}
          accessibilityRole="button"
          accessibilityLabel="Aggiorna"
          hitSlop={12}
          style={styles.refresh}>
          {loading ? (
            <ActivityIndicator size="small" color={colors.primary} />
          ) : (
            <SymbolView name={{ ios: 'arrow.clockwise', android: 'refresh' }} tintColor={colors.primary} size={18} />
          )}
          <Text style={styles.updated}>·</Text>
          <Text style={styles.updated}>{fetchedAt ? `Aggiornato alle ${formatTime(fetchedAt)}` : 'Caricamento…'}</Text>
        </Pressable>

        <Text style={styles.chosenLabel}>Mese scelto:</Text>
        <Text style={styles.chosen}>{month ? month.label : 'Ancora nessun mese selezionato'}</Text>

        {month && atWork > 0 && (
          <Pressable
            onPress={() => router.navigate('/correggi')}
            accessibilityRole="button"
            accessibilityHint="Apre Correggi Orari"
            style={({ pressed }) => [styles.warning, pressed && styles.pressed]}>
            <SymbolView
              name={{ ios: 'exclamationmark.triangle.fill', android: 'warning' }}
              tintColor={colors.error}
              size={22}
            />
            <Text style={styles.warningText}>
              {atWork === 1
                ? 'In questo mese 1 turno risulta ancora "al lavoro": le sue ore non sono conteggiate. '
                : `In questo mese ${atWork} turni risultano ancora "al lavoro": le loro ore non sono conteggiate. `}
              Inserisci l&apos;uscita da{' '}
              <Text style={styles.warningLink}>Correggi Orari</Text>.
            </Text>
          </Pressable>
        )}

        <View style={styles.buttons}>
          <AppButton
            title="Conteggio Veloce"
            onPress={quickCount}
            disabled={!month}
            style={styles.button}
          />
          <AppButton
            title="Ricevi Mail Conteggio Veloce"
            onPress={sendMail}
            disabled={!month || busy !== null}
            loading={busy === 'mail'}
            style={styles.button}
          />
          <AppButton
            title="Ricevi Report Excel Completo"
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
  refresh: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.xs },
  updated: { fontSize: 12, color: colors.muted },
  warning: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    padding: spacing.sm + 2,
    borderRadius: radius.card,
    backgroundColor: '#FDECEE',
    marginTop: spacing.sm,
  },
  pressed: { opacity: 0.6 },
  warningText: { flex: 1, fontSize: 14, color: colors.text },
  warningLink: { color: colors.primary, fontWeight: '700', textDecorationLine: 'underline' },
  totalName: { fontSize: 15, color: colors.text, flex: 1 },
  totalHours: { fontSize: 15, fontWeight: '700', color: colors.text },
  note: { fontSize: 12, color: colors.muted, marginTop: spacing.xs },
});
