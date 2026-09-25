import { Tabs } from 'expo-router';
import type { ColorValue } from 'react-native';

import { Icon } from '@/ui/components';
import { useColors } from '@/ui/theme';

export default function TabsLayout() {
  const c = useColors();
  const icon = (name: string) =>
    function TabIcon({ color }: { color: ColorValue }) {
      return <Icon name={name} size={24} color={color as string} />;
    };
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: c.primaryDark,
        tabBarInactiveTintColor: c.muted,
        tabBarStyle: { backgroundColor: c.surface, borderTopColor: c.border },
      }}>
      <Tabs.Screen name="index" options={{ title: 'Início', tabBarIcon: icon('home-variant-outline') }} />
      <Tabs.Screen name="lancamentos" options={{ title: 'Lançamentos', tabBarIcon: icon('format-list-bulleted') }} />
      <Tabs.Screen name="recorrencias" options={{ title: 'Fixos', tabBarIcon: icon('calendar-sync-outline') }} />
      <Tabs.Screen name="mais" options={{ title: 'Mais', tabBarIcon: icon('dots-horizontal') }} />
    </Tabs>
  );
}
