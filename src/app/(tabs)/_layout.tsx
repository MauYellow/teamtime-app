import { Tabs } from 'expo-router/js-tabs';
import { SymbolView, type SymbolViewProps } from 'expo-symbols';
import type { ColorValue } from 'react-native';

import { colors } from '@/theme';

type IconName = SymbolViewProps['name'];

function tabIcon(name: IconName) {
  return function TabIcon({ color, size }: { color: ColorValue; size: number }) {
    return <SymbolView name={name} tintColor={color} size={size} />;
  };
}

// Tab bar dell'area dipendente (come la tab bar di Thunkable): Home, Accesso Dipendenti, Registro Online, Supporto.
export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.muted,
      }}>
      <Tabs.Screen name="home" options={{ title: 'Home', tabBarIcon: tabIcon({ ios: 'house.fill', android: 'home' }) }} />
      <Tabs.Screen
        name="accesso"
        options={{ title: 'Accesso Dipendenti', tabBarIcon: tabIcon({ ios: 'person.text.rectangle.fill', android: 'badge' }) }}
      />
      <Tabs.Screen
        name="registro"
        options={{ title: 'Registro Online', tabBarIcon: tabIcon({ ios: 'calendar.badge.clock', android: 'event_note' }) }}
      />
      <Tabs.Screen
        name="supporto"
        options={{ title: 'Supporto', tabBarIcon: tabIcon({ ios: 'info.circle.fill', android: 'info' }) }}
      />
    </Tabs>
  );
}
