import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import {
  calendarMonthLabel,
  PresenceCalendar,
  recordsOfCalendarMonth,
  type CalendarMonth,
} from '@/components/PresenceCalendar';
import { formatTime } from '@/lib/activities';
import {
  closeReportNotice,
  employeeRecords,
  monthParam,
  oldestAvailableDay,
  parseMonthParam,
  previousMonth,
  RETENTION_DISCLAIMER,
  saveEmployeeReport,
  shareEmployeeReport,
  shortDate,
  type EmployeePresenza,
} from '@/lib/employeeReport';
import { companyName, intercambioActive, myCompanies, oldestFetch, refreshEmployeeTables } from '@/lib/history';
import { log } from '@/lib/log';
import { askReviewBeforeReport } from '@/lib/review';
import { getEmployeeLocale, getEmployeeName } from '@/lib/storage';
import { colors, radius, spacing } from '@/theme';

// Calendario del dipendente (SPEC §6.1, 4.1.0): lo stesso calendario dell'area manager, solo con le righe del
// dipendente, e il report Excel del mese mostrato. Si apre da Accessi ("Calendario completo") e dagli avvisi in Home.
// Parametri: `aziende` (tabelle separate da virgola; senza, tutte quelle del dipendente) e `mese` ("AAAA-MM").
// Dati: la copia di Airtable dell'app (lib/history.ts), riletta solo se ha più di 30 minuti, come in Accessi.
export default function CalendarioDipendenteScreen() {
  const params = useLocalSearchParams<{ aziende?: string; mese?: string }>();
  // Letti una volta all'apertura (valori stabili per il caricamento).
  const [name] = useState(getEmployeeName);
  const [locale] = useState(getEmployeeLocale);
  const [tables] = useState(() => (params.aziende ? params.aziende.split(',').filter(Boolean) : myCompanies()));
  const now = new Date();
  const [month, setMonth] = useState<CalendarMonth>(
    () => parseMonthParam(params.mese) ?? { year: now.getFullYear(), month: now.getMonth() }
  );
  const [records, setRecords] = useState<EmployeePresenza[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  const [saving, setSaving] = useState(false);
  const load = useCallback(
    async (force: boolean) => {
      // Prima la copia già sul telefono (si vede subito), poi l'eventuale rilettura.
      setRecords(employeeRecords(tables, name));
      if (!locale || !name) return;
      setLoading(true);
      try {
        await refreshEmployeeTables(locale, name, intercambioActive(), force ? 'all' : 'stale');
        setFailed(false);
      } catch (error) {
        log(`Calendario dipendente: errore lettura ${String(error)}`);
        setFailed(true);
      } finally {
        setRecords(employeeRecords(tables, name));
        setLoading(false);
      }
    },
    [tables, locale, name]
  );

  useFocusEffect(
    useCallback(() => {
      log('Calendario dipendente: apertura');
      load(false);
    }, [load])
  );

  const oldest = oldestAvailableDay(records ?? []);
  const monthRows = recordsOfCalendarMonth(records ?? [], month);
  const fetched = oldestFetch(tables, name);
  const status = failed
    ? 'Connessione assente: dati non aggiornati'
    : loading && !fetched
      ? 'Caricamento…'
      : fetched
        ? `Aggiornato il ${new Date(fetched).getDate()}/${new Date(fetched).getMonth() + 1} alle ${formatTime(new Date(fetched))}`
        : 'Non ancora aggiornato';
  const label = calendarMonthLabel(month).split(' ')[0];
  const empty = monthRows.length === 0;

  const download = async (mode: 'save' | 'share') => {
    if (!name || !records) return;
    // Richiesta di recensione prima del file, a un tocco sì e uno no (lib/review.ts); il file parte comunque.
    await askReviewBeforeReport(mode === 'save' ? 'scaricare' : 'condividere');
    setSaving(true);
    try {
      log(`Calendario dipendente: Excel di ${monthParam(month)} (${mode === 'save' ? 'scarica' : 'condividi'})`);
      const result =
        mode === 'save'
          ? await saveEmployeeReport(name, month, records, oldest)
          : (await shareEmployeeReport(name, month, records, oldest), 'shared');
      if (result === 'cancelled') return;
      // Scaricato il report del mese precedente: l'avviso in Home non serve più.
      if (monthParam(month) === monthParam(previousMonth())) closeReportNotice(month);
      if (result === 'saved') Alert.alert('Report scaricato', `Il report di ${label} è stato salvato nella cartella scelta.`);
    } catch (error) {
      log(`Calendario dipendente: Excel non creato ${String(error)}`);
      Alert.alert('Report non creato', 'Non è stato possibile creare il file. Riprova.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.topBar}>
        <Pressable onPress={() => router.back()} accessibilityRole="button" accessibilityLabel="Indietro" hitSlop={12} style={styles.back}>
          <SymbolView name={{ ios: 'chevron.left', android: 'chevron_left' }} tintColor={colors.primary} size={22} />
          <Text style={styles.backText}>Indietro</Text>
        </Pressable>
      </View>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.title}>Il tuo calendario</Text>
        {tables.length > 1 && <Text style={styles.companies}>{tables.map(companyName).join(' · ')}</Text>}
        {/* Avviso subito sotto il titolo (scelta dell'utente del 17/11/2026). */}
        <View style={styles.disclaimer}>
          <SymbolView name={{ ios: 'info.circle', android: 'info' }} tintColor={colors.primary} size={18} />
          <Text style={styles.disclaimerText}>{RETENTION_DISCLAIMER}</Text>
        </View>

        {/* Report del mese mostrato, tra l'avviso e il mese perché si veda subito (scelta dell'utente): a destra scarica e condividi (icone), spenti se il mese è vuoto. */}
        <View style={[styles.reportRow, empty && styles.reportEmpty]}>
          <SymbolView name={{ ios: 'tablecells', android: 'table_chart' }} tintColor={colors.success} size={22} />
          <Text style={styles.reportLabel}>Report Excel Dipendente {label}</Text>
          {saving ? (
            <ActivityIndicator color={colors.primary} />
          ) : (
            <>
              <Pressable
                onPress={() => download('save')}
                disabled={empty}
                accessibilityRole="button"
                accessibilityLabel={`Scarica il report Excel di ${label}`}
                hitSlop={8}
                style={({ pressed }) => [styles.iconButton, pressed && styles.pressed]}>
                <SymbolView name={{ ios: 'arrow.down.circle', android: 'download' }} tintColor={colors.primary} size={26} />
              </Pressable>
              <Pressable
                onPress={() => download('share')}
                disabled={empty}
                accessibilityRole="button"
                accessibilityLabel={`Condividi il report Excel di ${label}`}
                hitSlop={8}
                style={({ pressed }) => [styles.iconButton, pressed && styles.pressed]}>
                <SymbolView name={{ ios: 'square.and.arrow.up', android: 'share' }} tintColor={colors.primary} size={24} />
              </Pressable>
            </>
          )}
        </View>
        {empty && <Text style={styles.reportNote}>Nessuna timbratura in questo mese: niente da scaricare.</Text>}
        <PresenceCalendar
          records={records}
          loading={loading}
          month={month}
          onMonthChange={setMonth}
          rowTitle={tables.length > 1 ? (record) => companyName((record as EmployeePresenza).table) : undefined}>
          <Pressable
            onPress={() => load(true)}
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
            <Text style={styles.updated}>{status}</Text>
          </Pressable>
          <Text style={styles.available}>
            {oldest ? `Timbrature disponibili dal ${shortDate(oldest)}` : 'Nessuna timbratura nel registro'}
          </Text>
        </PresenceCalendar>

      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  topBar: { paddingHorizontal: spacing.md, paddingTop: spacing.sm },
  back: { flexDirection: 'row', alignItems: 'center', gap: 2, alignSelf: 'flex-start' },
  backText: { color: colors.primary, fontSize: 16 },
  content: { padding: spacing.md, paddingBottom: spacing.xl, gap: spacing.sm },
  title: { fontSize: 20, fontWeight: '700', color: colors.text, textAlign: 'center' },
  companies: { fontSize: 13, color: colors.muted, textAlign: 'center' },
  refresh: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.xs },
  updated: { fontSize: 12, color: colors.muted },
  available: { fontSize: 13, color: colors.text, textAlign: 'center', fontWeight: '600' },
  reportRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    padding: spacing.md,
    borderRadius: radius.card,
    backgroundColor: colors.surface,
  },
  reportEmpty: { opacity: 0.5 },
  reportLabel: { flex: 1, fontSize: 15, fontWeight: '600', color: colors.text },
  reportNote: { fontSize: 12, color: colors.muted, textAlign: 'center' },
  iconButton: { padding: spacing.xs },
  pressed: { opacity: 0.5 },
  disclaimer: {
    flexDirection: 'row',
    gap: spacing.sm,
    padding: spacing.md,
    borderRadius: radius.card,
    backgroundColor: colors.surface,
  },
  disclaimerText: { flex: 1, fontSize: 13, color: colors.muted, lineHeight: 19 },
});
