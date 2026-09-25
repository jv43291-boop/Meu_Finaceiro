import { View } from 'react-native';

import { Card, Icon, ListRow, Screen, T } from '@/ui/components';
import { useAppTheme, useColors, type ThemePreference } from '@/ui/theme';

const OPTIONS: { value: ThemePreference; label: string; hint: string; icon: string }[] = [
  { value: 'system', label: 'Automático', hint: 'Segue o tema do celular', icon: 'theme-light-dark' },
  { value: 'light', label: 'Claro', hint: 'Sempre claro', icon: 'white-balance-sunny' },
  { value: 'dark', label: 'Escuro', hint: 'Sempre escuro, melhor à noite', icon: 'weather-night' },
];

export default function AppearanceScreen() {
  const c = useColors();
  const { preference, setPreference } = useAppTheme();
  return (
    <Screen>
      <Card>
        <T variant="label">Tema</T>
        <View accessibilityRole="radiogroup">
          {OPTIONS.map((o) => {
            const selected = preference === o.value;
            return (
              <ListRow
                key={o.value}
                icon={o.icon}
                title={o.label}
                subtitle={o.hint}
                onPress={() => setPreference(o.value)}
                right={<Icon name={selected ? 'radiobox-marked' : 'radiobox-blank'} color={selected ? c.primary : c.muted} />}
              />
            );
          })}
        </View>
      </Card>
    </Screen>
  );
}
