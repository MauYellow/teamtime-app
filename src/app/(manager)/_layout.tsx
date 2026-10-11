import { Redirect } from 'expo-router';
import { Tabs } from 'expo-router/js-tabs';
import { SymbolView, type SymbolViewProps } from 'expo-symbols';
import type { ColorValue } from 'react-native';

import { useSession } from '@/lib/session';
import { colors } from '@/theme';

type IconName = SymbolViewProps['name'];

function tabIcon(name: IconName) {
  return function TabIcon({ color, size }: { color: ColorValue; size: number }) {
    return <SymbolView name={name} tintColor={color} size={size} />;
  };
}

// Area manager (SPEC §8): Il tuo piano · Impostazioni · Correggi Orari · Conteggio · Calendario.
// [develop 11/10/2026] "Esci" non è più una scheda: è un pulsante in alto in ogni scheda (components/ManagerExit).
export default function ManagerLayout() {
  const { manager } = useSession();
  if (!manager) return <Redirect href="/registro" />;

  return (
    <Tabs
      initialRouteName="calendario"
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.muted,
      }}>
      <Tabs.Screen
        name="piano"
        options={{ title: 'Il tuo piano', tabBarIcon: tabIcon({ ios: 'briefcase.fill', android: 'work' }) }}
      />
      <Tabs.Screen
        name="impostazioni"
        options={{ title: 'Impostazioni', tabBarIcon: tabIcon({ ios: 'gearshape.fill', android: 'settings' }) }}
      />
      <Tabs.Screen
        name="correggi"
        options={{ title: 'Correggi Orari', tabBarIcon: tabIcon({ ios: 'square.and.pencil', android: 'edit_note' }) }}
      />
      <Tabs.Screen
        name="conteggio"
        options={{ title: 'Conteggio', tabBarIcon: tabIcon({ ios: 'sum', android: 'calculate' }) }}
      />
      <Tabs.Screen
        name="calendario"
        options={{ title: 'Calendario', tabBarIcon: tabIcon({ ios: 'calendar', android: 'calendar_month' }) }}
      />
    </Tabs>
  );
}
