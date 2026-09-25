import { router, Tabs } from 'expo-router';
import { Pressable, View, type ColorValue } from 'react-native';

import { Icon, cardShadow } from '@/ui/components';
import { fonts, useColors } from '@/ui/theme';

export default function TabsLayout() {
  const c = useColors();
  const icon = (name: string, active: string) =>
    function TabIcon({ color, focused }: { color: ColorValue; focused: boolean }) {
      return <Icon name={focused ? active : name} size={24} color={color as string} />;
    };
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: c.primaryText,
        tabBarInactiveTintColor: c.muted,
        tabBarLabelStyle: { fontFamily: fonts.bold, fontSize: 11 },
        tabBarStyle: { backgroundColor: c.surface, borderTopColor: c.border, height: 68, paddingTop: 6 },
      }}>
      <Tabs.Screen name="index" options={{ title: 'Início', tabBarIcon: icon('home-outline', 'home') }} />
      <Tabs.Screen name="lancamentos" options={{ title: 'Extrato', tabBarIcon: icon('format-list-bulleted', 'format-list-bulleted') }} />
      <Tabs.Screen
        name="novo"
        options={{
          title: 'Novo',
          tabBarAccessibilityLabel: 'Novo lançamento',
          tabBarButton: () => (
            <View style={{ flex: 1, alignItems: 'center' }}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Novo lançamento"
                onPress={() => router.push('/lancamento/novo')}
                style={({ pressed }) => [
                  { width: 58, height: 58, marginTop: -22, borderRadius: 20, backgroundColor: c.primary, alignItems: 'center', justifyContent: 'center', opacity: pressed ? 0.85 : 1 },
                  cardShadow(c),
                  { shadowColor: c.primary, shadowOpacity: 0.35, elevation: 6 },
                ]}>
                <Icon name="plus" size={30} color={c.onPrimary} />
              </Pressable>
            </View>
          ),
        }}
      />
      <Tabs.Screen name="recorrencias" options={{ title: 'Fixos', tabBarIcon: icon('calendar-sync-outline', 'calendar-sync') }} />
      <Tabs.Screen name="mais" options={{ title: 'Mais', tabBarIcon: icon('dots-horizontal-circle-outline', 'dots-horizontal-circle') }} />
    </Tabs>
  );
}
