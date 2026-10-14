import { SymbolView } from 'expo-symbols';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AppButton } from '@/components/AppButton';
import { ManagerExit } from '@/components/ManagerExit';
import { SectionHeader } from '@/components/SectionHeader';
import { api } from '@/lib/api';
import { writeCache } from '@/lib/cache';
import { isYes, localeCacheKey, type LocaleFields } from '@/lib/locali';
import { log } from '@/lib/log';
import { localePreferences, type LocalePreferences } from '@/lib/preferences';
import { getSession, updateSession, useSession } from '@/lib/session';
import { storeMethod } from '@/lib/subscription';
import { colors, radius, spacing } from '@/theme';

// Area manager → Impostazioni (SPEC §16): rappresentano il JSON della colonna "Impostazioni" di Locali Approvati del
// locale del manager (dopo il login del Registro Online). Scheda "Impostazioni" del menu manager.
export default function ImpostazioniScreen() {
  const { manager } = useSession();
  const locale = manager?.Locale ?? null;
  const [record, setRecord] = useState<LocaleFields | null>(null);
  const [preferences, setPreferences] = useState<LocalePreferences | null>(null);
  const [failed, setFailed] = useState(false);
  const [saving, setSaving] = useState(false);
  /** GPS e Intercambio del locale (Locali Approvati). Modificabili solo con l'abbonamento dagli store (SPEC §17). */
  const [features, setFeatures] = useState({ gps: false, intercambio: false });
  const featuresEditable = !!storeMethod(record);
  const canSave = !!locale;

  useEffect(() => {
    if (!locale) return;
    let cancelled = false;
    // Riga del locale del manager tramite il proxy (con il gettone del login).
    api<{ locale: LocaleFields }>('/manager/locale', { token: getSession().managerToken ?? '' })
      .then(({ locale: found }) => {
        if (cancelled) return;
        setRecord(found);
        setFeatures({ gps: isYes(found.GPS), intercambio: isYes(found.Intercambio) });
        setPreferences(localePreferences(found));
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
      // GPS e Intercambio contano solo per chi paga dagli store: per gli altri il proxy non li tocca (SPEC §17).
      const { locale: updated } = await api<{ locale: LocaleFields }>('/manager/settings', {
        token: getSession().managerToken ?? '',
        impostazioni: preferences,
        ...(featuresEditable ? { gps: features.gps, intercambio: features.intercambio } : {}),
      });
      setRecord(updated);
      // Sessione aggiornata subito: area manager e, se è anche il locale del dipendente su questo telefono, Gestisci.
      const sameAsEmployee = getSession().locale?.Locale === locale;
      updateSession(sameAsEmployee ? { manager: updated, locale: updated } : { manager: updated });
      writeCache(localeCacheKey(locale ?? ''), updated);
      log(`Impostazioni salvate per ${locale}: ${JSON.stringify(preferences)}`);
      Alert.alert('Salvato', 'Le impostazioni sono state aggiornate.', [{ text: 'OK' }]);
    } catch (error) {
      log(`Impostazioni: errore salvataggio ${String(error)}`);
      Alert.alert('Non salvato', 'Controlla la connessione e riprova.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ManagerExit />
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.title}>Impostazioni dipendenti</Text>
        <Text style={styles.subtitle}>{locale}</Text>
        <Text style={styles.banner}>Cosa possono fare i tuoi dipendenti dalla scheda Gestisci dell&apos;app.</Text>

        {!locale ? null : failed ? (
          <Text style={styles.muted}>Impostazioni non disponibili: controlla la connessione.</Text>
        ) : !preferences ? (
          <ActivityIndicator color={colors.primary} style={styles.loader} />
        ) : (
          <>
            <SectionHeader title="Uscite dimenticate" />
            <SettingSwitch
              label="Il dipendente può inserire da solo le uscite dimenticate"
              info={
                'Se attiva, nella scheda Gestisci il dipendente può inserire l’orario di uscita dei turni in cui ha ' +
                'dimenticato di timbrare. L’uscita vale subito, nel registro compare come "Inserita dal dipendente" e ' +
                'il dipendente non può più modificarla. Se spenta, solo il manager può correggere i turni.'
              }
              value={preferences.correzioneUscite}
              onChange={(value) => change({ correzioneUscite: value })}
              disabled={!canSave}
            />
            <Stepper
              label="Turni correggibili: ultimi giorni"
              info={
                'Numero massimo di giorni, dopo l’uscita dimenticata, entro cui il dipendente può correggersi da solo. ' +
                'Esempio: con 7, un turno di lunedì si può correggere fino al lunedì successivo; dopo, solo il manager ' +
                'può farlo.'
              }
              value={preferences.giorniCorrezione}
              min={1}
              max={60}
              onChange={(value) => change({ giorniCorrezione: value })}
              disabled={!canSave || !preferences.correzioneUscite}
            />
            <Stepper
              label="Durata massima di un turno (ore)"
              info={
                'Il turno più lungo che il dipendente può inserire da solo, dall’entrata all’uscita. Esempio: con 16, ' +
                'per un’entrata alle 9:00 l’uscita può essere al massimo alle 1:00 della notte. Per turni più lunghi ' +
                'deve intervenire il manager.'
              }
              value={preferences.oreMaxTurno}
              min={1}
              max={24}
              onChange={(value) => change({ oreMaxTurno: value })}
              disabled={!canSave || !preferences.correzioneUscite}
            />

            <SectionHeader title="Funzioni del piano" style={styles.sectionSpacing} />
            <SettingSwitch
              label="GPS: posizione registrata a ogni timbratura"
              info={
                'Se attivo, a ogni entrata e uscita l’app registra la posizione del dipendente (l’indirizzo compare nel ' +
                'registro). Il dipendente deve dare il permesso alla posizione.'
              }
              value={features.gps}
              onChange={(value) => setFeatures((current) => ({ ...current, gps: value }))}
              disabled={!canSave || !featuresEditable}
            />
            <SettingSwitch
              label="Intercambio: timbrare anche con il QR di altri locali"
              info={
                'Se attivo, i tuoi dipendenti possono timbrare anche scansionando il QR Code di un altro locale ' +
                'TeamTime (per esempio un’altra sede): la presenza viene registrata nel registro di quel locale.'
              }
              value={features.intercambio}
              onChange={(value) => setFeatures((current) => ({ ...current, intercambio: value }))}
              disabled={!canSave || !featuresEditable}
            />
            {!featuresEditable && (
              <Text style={styles.note}>
                GPS e Intercambio fanno parte del piano acquistato dal sito: per cambiarli contatta l&apos;assistenza.
              </Text>
            )}

            <SectionHeader title="Ferie e permessi" style={styles.sectionSpacing} />
            <SettingSwitch
              label="Il dipendente può chiedere ferie e permessi (in arrivo)"
              info={
                'Se attiva, nella scheda Gestisci il dipendente potrà inviare richieste di ferie e permessi, che il ' +
                'manager vedrà e gestirà. La funzione è in arrivo: per ora questa impostazione non ha effetto.'
              }
              value={preferences.richieste}
              onChange={(value) => change({ richieste: value })}
              disabled={!canSave}
            />

            {canSave && <AppButton title="Salva" onPress={save} loading={saving} style={styles.save} />}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

/** Testo dell'impostazione con l'icona "i" che apre la spiegazione (avviso di sistema). */
function SettingLabel({ label, info, disabled }: { label: string; info: string; disabled?: boolean }) {
  return (
    <View style={styles.labelRow}>
      <Text style={[styles.settingLabel, disabled && styles.disabledText]}>{label}</Text>
      <Pressable
        onPress={() => Alert.alert(label, info)}
        accessibilityRole="button"
        accessibilityLabel={`Informazioni su ${label}`}
        hitSlop={10}>
        <SymbolView name={{ ios: 'info.circle', android: 'info' }} tintColor={colors.primary} size={18} />
      </Pressable>
    </View>
  );
}

function SettingSwitch(props: {
  label: string;
  info: string;
  value: boolean;
  onChange: (value: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <View style={styles.setting}>
      <SettingLabel label={props.label} info={props.info} disabled={props.disabled} />
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
  info: string;
  value: number;
  min: number;
  max: number;
  onChange: (value: number) => void;
  disabled?: boolean;
}) {
  const step = (delta: number) => props.onChange(Math.min(props.max, Math.max(props.min, props.value + delta)));
  return (
    <View style={styles.setting}>
      <SettingLabel label={props.label} info={props.info} disabled={props.disabled} />
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
  note: { color: colors.muted, fontSize: 13, paddingHorizontal: spacing.sm, marginTop: spacing.xs },
  setting: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.xs,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  labelRow: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  settingLabel: { flexShrink: 1, fontSize: 15, color: colors.text },
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
  save: { marginTop: spacing.md },
});
