import { useFocusEffect } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { BusyOverlay } from '@/components/BusyOverlay';
import { LogoHeader } from '@/components/LogoHeader';
import { SectionHeader } from '@/components/SectionHeader';
import { useTimePicker } from '@/components/TimePicker';
import { formatTime } from '@/lib/activities';
import { checkExit, correctableShifts, correctExit, tooOldShifts } from '@/lib/correction';
import { confirmAlert } from '@/lib/dialogs';
import { dayLabel, formatEmployeeHours, getSavedHistory, needsRefresh, refreshHistory, type SavedHistory } from '@/lib/history';
import { log } from '@/lib/log';
import type { Presenza } from '@/lib/manager';
import { localePreferences } from '@/lib/preferences';
import { useSession } from '@/lib/session';
import { getEmployeeLocale, getEmployeeName } from '@/lib/storage';
import { colors, radius, spacing } from '@/theme';

const NOT_ACTIVE = "Questa funzione non è attiva per l'azienda in cui lavori.";

// Gestisci (SPEC §16): uscite dimenticate corrette dal dipendente e, in futuro, richieste di ferie e permessi.
// Sempre visibile; ogni parte si usa solo se attiva nelle Impostazioni del locale (lib/preferences.ts).
export default function GestisciScreen() {
  const { locale: localeRecord } = useSession();
  const preferences = localePreferences(localeRecord);
  const [locale, setLocale] = useState(getEmployeeLocale);
  const [name, setName] = useState(getEmployeeName);
  const [saved, setSaved] = useState<SavedHistory | null>(() => getSavedHistory(getEmployeeLocale(), getEmployeeName()));
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const { pickTime, picker } = useTimePicker();

  const load = useCallback(async (table: string | null, employee: string | null, force: boolean) => {
    if (!table || !employee) return;
    if (!force && !needsRefresh(getSavedHistory(table, employee))) return;
    setLoading(true);
    try {
      setSaved(await refreshHistory(table, employee));
      setFailed(false);
    } catch (error) {
      log(`Gestisci: errore lettura turni ${String(error)}`);
      setFailed(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      const table = getEmployeeLocale();
      const employee = getEmployeeName();
      setLocale(table);
      setName(employee);
      setSaved(getSavedHistory(table, employee));
      load(table, employee, false);
    }, [load])
  );

  const correct = async (record: Presenza) => {
    if (!locale) return;
    // Proposta iniziale: 8 ore dopo l'entrata.
    const initial = new Date();
    const [hours, minutes] = (record.fields.Entrata ?? '').split(/[:.]/).map(Number);
    if (Number.isFinite(hours) && Number.isFinite(minutes)) initial.setHours(hours + 8, minutes, 0, 0);
    const exit = await pickTime(`Uscita del turno di ${dayLabel(record)}`, initial);
    if (!exit) return;

    const check = checkExit(record, exit, preferences);
    if (!check.ok) {
      Alert.alert('Orario non valido', check.message);
      return;
    }
    const confirmed = await confirmAlert(
      "Confermi l'uscita?",
      `Turno di ${dayLabel(record)}: entrata ${record.fields.Entrata}, uscita ${formatTime(exit)} ` +
        `(${formatEmployeeHours(check.minutes / 60)} ore).\n\nDopo la conferma non potrai più modificarla: il tuo ` +
        'responsabile la vedrà come inserita da te.',
      { confirm: 'Conferma' }
    );
    if (!confirmed) return;

    setBusy('Salvataggio uscita..');
    try {
      const result = await correctExit(locale, record, exit);
      setSaved(getSavedHistory(locale, name));
      setBusy(null);
      if (result === 'done') Alert.alert('Uscita registrata', 'Grazie! Il turno ora risulta chiuso.');
      else if (result === 'alreadyClosed') Alert.alert('Turno già chiuso', 'Il tuo responsabile ha già chiuso questo turno.');
      else Alert.alert('Turno non trovato', 'Questo turno non è più presente nel registro.');
    } catch (error) {
      setBusy(null);
      log(`Gestisci: errore correzione ${String(error)}`);
      Alert.alert('Uscita non salvata', 'Connessione scarsa o assente. Riprova fra pochi minuti.');
    }
  };

  if (!locale || !name) {
    return (
      <SafeAreaView style={styles.safe} edges={['top']}>
        <LogoHeader variant="icon" />
        <Text style={styles.empty}>Registrati come dipendente in Accessi per usare questa sezione.</Text>
      </SafeAreaView>
    );
  }

  const records = saved?.records ?? [];
  const shifts = correctableShifts(records, preferences);
  const oldShifts = tooOldShifts(records, preferences);
  const fetchedAt = saved ? new Date(saved.fetchedAt) : null;
  const status = failed
    ? 'Connessione assente: dati non aggiornati'
    : fetchedAt
      ? `Aggiornato il ${fetchedAt.getDate()}/${fetchedAt.getMonth() + 1} alle ${formatTime(fetchedAt)}`
      : 'Non ancora aggiornato';

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <LogoHeader variant="icon" />
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.title}>Gestisci</Text>

        <SectionHeader
          title="Uscite dimenticate"
          info={
            `Se hai dimenticato di registrare l'uscita puoi inserirla tu, entro ${preferences.giorniCorrezione} giorni. ` +
            "L'uscita vale subito, il tuo responsabile la vede segnata come inserita da te e non potrai più modificarla."
          }
        />
        {!preferences.correzioneUscite ? (
          <Text style={styles.disabled}>{NOT_ACTIVE}</Text>
        ) : (
          <>
            {shifts.length === 0 ? (
              <View style={styles.okRow}>
                <SymbolView name={{ ios: 'checkmark.circle.fill', android: 'check_circle' }} tintColor={colors.success} size={20} />
                <Text style={styles.okText}>{saved ? 'Nessuna uscita da inserire' : 'Caricamento…'}</Text>
              </View>
            ) : (
              shifts.map((record) => (
                <Pressable
                  key={record.id}
                  onPress={() => correct(record)}
                  disabled={busy !== null}
                  accessibilityRole="button"
                  accessibilityHint="Inserisci l'orario di uscita"
                  style={({ pressed }) => [styles.shift, pressed && styles.pressed]}>
                  <View style={styles.flex}>
                    <Text style={styles.shiftDay}>{dayLabel(record)}</Text>
                    <Text style={styles.shiftText}>Entrata {record.fields.Entrata} · uscita non registrata</Text>
                  </View>
                  <Text style={styles.action}>Inserisci uscita ›</Text>
                </Pressable>
              ))
            )}
            {oldShifts.length > 0 && (
              <Text style={styles.note}>
                {oldShifts.length === 1 ? '1 turno non chiuso è' : `${oldShifts.length} turni non chiusi sono`} più
                vecchi di {preferences.giorniCorrezione} giorni: può correggerli solo il tuo responsabile.
              </Text>
            )}
            <Pressable
              onPress={() => load(locale, name, true)}
              disabled={loading}
              accessibilityRole="button"
              accessibilityLabel="Aggiorna"
              hitSlop={12}
              style={({ pressed }) => [styles.refresh, pressed && styles.pressed]}>
              {loading ? (
                <ActivityIndicator size="small" color={colors.primary} />
              ) : (
                <SymbolView name={{ ios: 'arrow.clockwise', android: 'refresh' }} tintColor={colors.primary} size={18} />
              )}
              <Text style={styles.updated}>·</Text>
              <Text style={styles.updated}>{status}</Text>
            </Pressable>
          </>
        )}

        <SectionHeader
          title="Ferie e permessi"
          info="Da qui potrai chiedere ferie e permessi al tuo responsabile. La funzione è in arrivo."
          style={styles.sectionSpacing}
        />
        <Text style={styles.disabled}>
          {preferences.richieste ? 'In arrivo: presto potrai chiedere ferie e permessi da qui.' : NOT_ACTIVE}
        </Text>
      </ScrollView>
      <BusyOverlay text={busy} />
      {picker}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.md, gap: spacing.sm, paddingBottom: spacing.xl },
  flex: { flex: 1 },
  title: { fontSize: 24, fontWeight: '700', color: colors.text, textAlign: 'center', marginBottom: spacing.sm },
  sectionSpacing: { marginTop: spacing.lg },
  disabled: {
    color: colors.muted,
    fontStyle: 'italic',
    textAlign: 'center',
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.sm,
  },
  okRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.sm, paddingVertical: spacing.md },
  okText: { color: colors.text, fontSize: 15 },
  shift: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    padding: spacing.md,
    borderRadius: radius.card,
    backgroundColor: colors.surface,
  },
  pressed: { opacity: 0.6 },
  shiftDay: { fontSize: 16, fontWeight: '700', color: colors.text },
  shiftText: { fontSize: 14, color: colors.muted, marginTop: 2 },
  action: { fontSize: 14, fontWeight: '700', color: colors.primary },
  note: { fontSize: 13, color: colors.muted, textAlign: 'center' },
  refresh: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.xs, marginTop: spacing.xs },
  updated: { fontSize: 12, color: colors.muted },
  empty: { textAlign: 'center', color: colors.muted, padding: spacing.lg, fontSize: 15 },
});
