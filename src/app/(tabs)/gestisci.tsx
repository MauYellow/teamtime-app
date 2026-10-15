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
import {
  companyInfo,
  companyName,
  dayLabel,
  formatEmployeeHours,
  getSavedHistory,
  intercambioActive,
  myCompanies,
  oldestFetch,
  refreshEmployeeTables,
} from '@/lib/history';
import { log } from '@/lib/log';
import type { Presenza } from '@/lib/manager';
import { localePreferences, type LocalePreferences } from '@/lib/preferences';
import { useSession } from '@/lib/session';
import { getEmployeeLocale, getEmployeeName } from '@/lib/storage';
import { colors, radius, spacing } from '@/theme';

const NOT_ACTIVE = "Questa funzione non è attiva per l'azienda in cui lavori.";

// Gestisci (SPEC §16): uscite dimenticate corrette dal dipendente e, in futuro, richieste di ferie e permessi.
// Sempre visibile; ogni parte si usa solo se attiva nelle Impostazioni del locale (lib/preferences.ts).
// Con l'Intercambio (SPEC §16.1) anche i turni nelle altre aziende, ciascuno con le impostazioni di quell'azienda;
// la correzione scrive nella riga della tabella di quell'azienda.

/** Turno non chiuso con l'azienda e le impostazioni che valgono per lui. */
type Shift = { table: string; record: Presenza; preferences: LocalePreferences };
export default function GestisciScreen() {
  const { locale: localeRecord } = useSession();
  const preferences = localePreferences(localeRecord);
  const [locale, setLocale] = useState(getEmployeeLocale);
  const [name, setName] = useState(getEmployeeName);
  const [tables, setTables] = useState<string[]>(myCompanies);
  /** Cambia a ogni lettura delle copie: ridisegna la schermata con i dati salvati. */
  const [, setVersion] = useState(0);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const { pickTime, picker } = useTimePicker();

  const load = useCallback(async (table: string | null, employee: string | null, force: boolean) => {
    if (!table || !employee) return;
    setLoading(true);
    try {
      await refreshEmployeeTables(table, employee, intercambioActive(), force ? 'all' : 'stale');
      setFailed(false);
    } catch (error) {
      log(`Gestisci: errore lettura turni ${String(error)}`);
      setFailed(true);
    } finally {
      setLoading(false);
      setTables(myCompanies());
      setVersion((value) => value + 1);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      const table = getEmployeeLocale();
      const employee = getEmployeeName();
      setLocale(table);
      setName(employee);
      setTables(myCompanies());
      load(table, employee, false);
    }, [load])
  );

  /**
   * Impostazioni di un'azienda: la propria dalla Splash, le altre da Locali Approvati salvate sul telefono. Finché non
   * sono note (copia appena creata da una timbratura) la correzione in quell'azienda resta spenta.
   */
  const preferencesOf = (table: string): LocalePreferences => {
    if (table === locale) return preferences;
    const info = companyInfo(table);
    return info ? localePreferences(info) : { ...localePreferences(null), correzioneUscite: false };
  };

  const correct = async ({ table, record, preferences: shiftPreferences }: Shift) => {
    if (!locale) return;
    // Proposta iniziale: 8 ore dopo l'entrata.
    const initial = new Date();
    const [hours, minutes] = (record.fields.Entrata ?? '').split(/[:.]/).map(Number);
    if (Number.isFinite(hours) && Number.isFinite(minutes)) initial.setHours(hours + 8, minutes, 0, 0);
    const exit = await pickTime(`Uscita del turno di ${dayLabel(record)}`, initial);
    if (!exit) return;

    const check = checkExit(record, exit, shiftPreferences);
    if (!check.ok) {
      Alert.alert('Orario non valido', check.message);
      return;
    }
    const confirmed = await confirmAlert(
      "Confermi l'uscita?",
      `Turno di ${dayLabel(record)}${multi ? ` in ${companyName(table)}` : ''}: entrata ${record.fields.Entrata}, ` +
        `uscita ${formatTime(exit)} ` +
        `(${formatEmployeeHours(check.minutes / 60)} ore).\n\nDopo la conferma non potrai più modificarla: il tuo ` +
        'responsabile la vedrà come inserita da te.',
      { confirm: 'Conferma' }
    );
    if (!confirmed) return;

    setBusy('Salvataggio uscita..');
    try {
      const result = await correctExit(table, record, exit);
      setVersion((value) => value + 1);
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

  const multi = tables.length > 1;
  const loaded = tables.some((table) => getSavedHistory(table, name) !== null);
  const shifts: Shift[] = [];
  /** Turni che solo il responsabile può correggere: troppo vecchi, o azienda con la correzione spenta. */
  let managerOnly = 0;
  for (const table of tables) {
    const records = getSavedHistory(table, name)?.records ?? [];
    const tablePreferences = preferencesOf(table);
    const correctable = correctableShifts(records, tablePreferences);
    if (tablePreferences.correzioneUscite) {
      shifts.push(...correctable.map((record) => ({ table, record, preferences: tablePreferences })));
      managerOnly += tooOldShifts(records, tablePreferences).length;
    } else {
      managerOnly += correctable.length + tooOldShifts(records, tablePreferences).length;
    }
  }
  /** Correzione attiva in almeno un'azienda: altrimenti la sezione dice che la funzione non è attiva. */
  const anyActive = tables.some((table) => preferencesOf(table).correzioneUscite);
  const fetched = oldestFetch(tables, name);
  const fetchedAt = fetched ? new Date(fetched) : null;
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
        {!anyActive ? (
          <Text style={styles.disabled}>{NOT_ACTIVE}</Text>
        ) : (
          <>
            {shifts.length === 0 ? (
              <View style={styles.okRow}>
                <SymbolView name={{ ios: 'checkmark.circle.fill', android: 'check_circle' }} tintColor={colors.success} size={20} />
                <Text style={styles.okText}>{loaded ? 'Nessuna uscita da inserire' : 'Caricamento…'}</Text>
              </View>
            ) : (
              shifts.map((shift) => (
                <Pressable
                  key={`${shift.table}:${shift.record.id}`}
                  onPress={() => correct(shift)}
                  disabled={busy !== null}
                  accessibilityRole="button"
                  accessibilityHint="Inserisci l'orario di uscita"
                  style={({ pressed }) => [styles.shift, pressed && styles.pressed]}>
                  <View style={styles.flex}>
                    <Text style={styles.shiftDay}>
                      {dayLabel(shift.record)}
                      {multi ? <Text style={styles.shiftCompany}> · {companyName(shift.table)}</Text> : null}
                    </Text>
                    <Text style={styles.shiftText}>Entrata {shift.record.fields.Entrata} · uscita non registrata</Text>
                  </View>
                  <Text style={styles.action}>Inserisci uscita ›</Text>
                </Pressable>
              ))
            )}
            {managerOnly > 0 && (
              <Text style={styles.note}>
                {multi
                  ? `${managerOnly === 1 ? '1 turno non chiuso può essere corretto' : `${managerOnly} turni non chiusi possono essere corretti`} ` +
                    'solo dal responsabile (turni troppo vecchi o azienda in cui la funzione non è attiva).'
                  : `${managerOnly === 1 ? '1 turno non chiuso è' : `${managerOnly} turni non chiusi sono`} più ` +
                    `vecchi di ${preferences.giorniCorrezione} giorni: può correggerli solo il tuo responsabile.`}
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
  shiftCompany: { fontSize: 14, fontWeight: '400', color: colors.muted },
  action: { fontSize: 14, fontWeight: '700', color: colors.primary },
  note: { fontSize: 13, color: colors.muted, textAlign: 'center' },
  refresh: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.xs, marginTop: spacing.xs },
  updated: { fontSize: 12, color: colors.muted },
  empty: { textAlign: 'center', color: colors.muted, padding: spacing.lg, fontSize: 15 },
});
