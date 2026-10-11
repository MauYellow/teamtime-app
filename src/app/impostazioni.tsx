import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Platform, Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AppButton } from '@/components/AppButton';
import { SectionHeader } from '@/components/SectionHeader';
import { PREFERENCES_TEST_LOCALES } from '@/config';
import { findFirst, formulaString, updateRecord, type AirtableRecord } from '@/lib/airtable';
import { writeCache } from '@/lib/cache';
import { LOCALI_TABLE, localeCacheKey, type LocaleFields } from '@/lib/locali';
import { log } from '@/lib/log';
import { localePreferences, type LocalePreferences } from '@/lib/preferences';
import { updateSession } from '@/lib/session';
import { getEmployeeLocale } from '@/lib/storage';
import { colors, radius, spacing } from '@/theme';

// Impostazioni del locale (PROVVISORIO, da Supporto): rappresentano il JSON della colonna "Preferenze" di Locali
// Approvati. Salvataggio solo per i locali di prova (PREFERENCES_TEST_LOCALES). Poi la schermata passerà nell'area
// manager del Registro Online.
export default function ImpostazioniScreen() {
  const locale = getEmployeeLocale();
  const [record, setRecord] = useState<AirtableRecord<LocaleFields> | null>(null);
  const [preferences, setPreferences] = useState<LocalePreferences | null>(null);
  const [failed, setFailed] = useState(false);
  const [saving, setSaving] = useState(false);
  const canSave = !!locale && PREFERENCES_TEST_LOCALES.includes(locale);

  useEffect(() => {
    if (!locale) return;
    let cancelled = false;
    findFirst<LocaleFields>(LOCALI_TABLE, `{Locale} = ${formulaString(locale)}`)
      .then((found) => {
        if (cancelled) return;
        setRecord(found);
        setPreferences(localePreferences(found?.fields ?? null));
      })
      .catch((error) => {
        log(`Impostazioni: errore lettura ${String(error)}`);
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [locale]);

  const change = (patch: Partial<LocalePreferences>) =>
    setPreferences((current) => (current ? { ...current, ...patch } : current));

  const save = async () => {
    if (!record || !preferences || !canSave) return;
    setSaving(true);
    try {
      const updated = await updateRecord<LocaleFields>(LOCALI_TABLE, record.id, {
        Preferenze: JSON.stringify(preferences),
      });
      // Le altre schermate leggono il locale dalla sessione: si aggiorna subito, senza riaprire l'app.
      updateSession({ locale: updated.fields });
      writeCache(localeCacheKey(locale ?? ''), updated.fields);
      log(`Impostazioni salvate per ${locale}: ${JSON.stringify(preferences)}`);
      Alert.alert('Salvato', 'Le impostazioni sono state aggiornate.', [{ text: 'OK', onPress: () => router.back() }]);
    } catch (error) {
      log(`Impostazioni: errore salvataggio ${String(error)}`);
      Alert.alert('Non salvato', 'Controlla la connessione e riprova.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.title}>Impostazioni azienda</Text>
        <Text style={styles.subtitle}>{locale ?? 'Nessuna azienda registrata su questo telefono'}</Text>
        <Text style={styles.banner}>
          {canSave
            ? 'Schermata provvisoria per i test: in futuro sarà nell’area manager del Registro Online.'
            : 'Schermata provvisoria: per ora si può salvare solo per i locali di prova. Le impostazioni qui sotto sono in sola lettura.'}
        </Text>

        {!locale ? null : failed ? (
          <Text style={styles.muted}>Impostazioni non disponibili: controlla la connessione.</Text>
        ) : !preferences ? (
          <ActivityIndicator color={colors.primary} style={styles.loader} />
        ) : (
          <>
            <SectionHeader title="Uscite dimenticate" />
            <SettingSwitch
              label="Il dipendente può inserire da solo le uscite dimenticate"
              value={preferences.correzioneUscite}
              onChange={(value) => change({ correzioneUscite: value })}
              disabled={!canSave}
            />
            <Stepper
              label="Turni correggibili: ultimi giorni"
              value={preferences.giorniCorrezione}
              min={1}
              max={60}
              onChange={(value) => change({ giorniCorrezione: value })}
              disabled={!canSave || !preferences.correzioneUscite}
            />
            <Stepper
              label="Durata massima di un turno (ore)"
              value={preferences.oreMaxTurno}
              min={1}
              max={24}
              onChange={(value) => change({ oreMaxTurno: value })}
              disabled={!canSave || !preferences.correzioneUscite}
            />

            <SectionHeader title="Ferie e permessi" style={styles.sectionSpacing} />
            <SettingSwitch
              label="Il dipendente può chiedere ferie e permessi (in arrivo)"
              value={preferences.richieste}
              onChange={(value) => change({ richieste: value })}
              disabled={!canSave}
            />

            <Text style={styles.jsonLabel}>Come verrà salvato nella colonna Preferenze:</Text>
            <Text style={styles.json} selectable>
              {JSON.stringify(preferences, null, 2)}
            </Text>

            {canSave && <AppButton title="Salva" onPress={save} loading={saving} style={styles.save} />}
          </>
        )}
        <AppButton title="Indietro" variant="outline" onPress={() => router.back()} />
      </ScrollView>
    </SafeAreaView>
  );
}

function SettingSwitch(props: { label: string; value: boolean; onChange: (value: boolean) => void; disabled?: boolean }) {
  return (
    <View style={styles.setting}>
      <Text style={[styles.settingLabel, props.disabled && styles.disabledText]}>{props.label}</Text>
      <Switch
        value={props.value}
        onValueChange={props.onChange}
        disabled={props.disabled}
        trackColor={{ true: colors.primary, false: colors.border }}
        accessibilityLabel={props.label}
      />
    </View>
  );
}

function Stepper(props: {
  label: string;
  value: number;
  min: number;
  max: number;
  onChange: (value: number) => void;
  disabled?: boolean;
}) {
  const step = (delta: number) => props.onChange(Math.min(props.max, Math.max(props.min, props.value + delta)));
  return (
    <View style={styles.setting}>
      <Text style={[styles.settingLabel, props.disabled && styles.disabledText]}>{props.label}</Text>
      <View style={styles.stepper}>
        <Pressable
          onPress={() => step(-1)}
          disabled={props.disabled || props.value <= props.min}
          accessibilityRole="button"
          accessibilityLabel={`Diminuisci ${props.label}`}
          style={({ pressed }) => [styles.stepButton, pressed && styles.pressed]}>
          <Text style={styles.stepText}>−</Text>
        </Pressable>
        <Text style={[styles.stepValue, props.disabled && styles.disabledText]}>{props.value}</Text>
        <Pressable
          onPress={() => step(1)}
          disabled={props.disabled || props.value >= props.max}
          accessibilityRole="button"
          accessibilityLabel={`Aumenta ${props.label}`}
          style={({ pressed }) => [styles.stepButton, pressed && styles.pressed]}>
          <Text style={styles.stepText}>+</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.md, gap: spacing.sm, paddingBottom: spacing.xl },
  title: { fontSize: 24, fontWeight: '700', color: colors.text, textAlign: 'center' },
  subtitle: { fontSize: 15, color: colors.muted, textAlign: 'center' },
  banner: {
    fontSize: 13,
    color: colors.text,
    backgroundColor: colors.surface,
    borderRadius: radius.input,
    padding: spacing.sm,
    textAlign: 'center',
    marginVertical: spacing.sm,
  },
  muted: { color: colors.muted, textAlign: 'center', padding: spacing.lg },
  loader: { marginVertical: spacing.lg },
  sectionSpacing: { marginTop: spacing.md },
  setting: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.xs,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  settingLabel: { flex: 1, fontSize: 15, color: colors.text },
  disabledText: { color: colors.muted },
  stepper: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  stepButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pressed: { opacity: 0.6 },
  stepText: { fontSize: 20, fontWeight: '700', color: colors.primary },
  stepValue: { minWidth: 28, textAlign: 'center', fontSize: 17, fontWeight: '700', color: colors.text },
  jsonLabel: { fontSize: 13, color: colors.muted, marginTop: spacing.md },
  json: {
    fontFamily: Platform.select({ ios: 'Menlo', default: 'monospace' }),
    fontSize: 13,
    color: colors.text,
    backgroundColor: colors.surface,
    borderRadius: radius.input,
    padding: spacing.sm,
  },
  save: { marginTop: spacing.md },
});
