import { Redirect, router } from 'expo-router';
import { Tabs } from 'expo-router/js-tabs';
import { SymbolView, type SymbolViewProps } from 'expo-symbols';
import type { ColorValue } from 'react-native';

import { log } from '@/lib/log';
import { updateSession, useSession } from '@/lib/session';
import { colors } from '@/theme';

type IconName = SymbolViewProps['name'];

function tabIcon(name: IconName) {
  return function TabIcon({ color, size }: { color: ColorValue; size: number }) {
    return <SymbolView name={name} tintColor={color} size={size} />;
  };
}

/** "Esci": chiude l'area manager e torna all'area dipendente. */
function logout() {
  log('Area manager: uscita');
  updateSession({ manager: null });
  router.dismissTo('/registro');
}

// Area manager (SPEC §8), con la sua tab bar come in Thunkable: Esci · Il tuo piano · Correggi Orari · Conteggio · Calendario.
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
        name="esci"
        options={{ title: 'Esci', tabBarIcon: tabIcon({ ios: 'xmark.circle.fill', android: 'logout' }) }}
        listeners={{
          tabPress: (event) => {
            event.preventDefault();
            logout();
          },
        }}
      />
      <Tabs.Screen
        name="piano"
        options={{ title: 'Il tuo piano', tabBarIcon: tabIcon({ ios: 'briefcase.fill', android: 'work' }) }}
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
      {/* Impostazioni dipendenti: non è nella tab bar, si apre da "Il tuo piano". */}
      <Tabs.Screen name="impostazioni" options={{ href: null }} />
    </Tabs>
  );
}
