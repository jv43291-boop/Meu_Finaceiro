import { View } from 'react-native';

import { formatBRL } from '@/domain/money';
import type { CreditCard } from '@/domain/types';
import { Icon, T } from './components';
import { radius, useColors, useHideValues } from './theme';

/** Barra de uso do limite: verde até 70%, âmbar até 90%, vermelho acima. */
export function LimitBar({ used, limit }: { used: number; limit: number }) {
  const c = useColors();
  const hidden = useHideValues();
  const pct = limit > 0 ? Math.min(1, used / limit) : 0;
  const color = pct > 0.9 ? c.danger : pct > 0.7 ? c.warning : c.primary;
  return (
    <View style={{ gap: 6 }}>
      <View
        accessibilityRole="progressbar"
        accessibilityValue={{ min: 0, max: 100, now: Math.round(pct * 100) }}
        style={{ height: 8, borderRadius: 4, backgroundColor: c.surfaceAlt, overflow: 'hidden' }}>
        <View style={{ width: `${pct * 100}%`, height: 8, borderRadius: 4, backgroundColor: color }} />
      </View>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
        <T variant="caption">Usado {hidden ? '•••' : formatBRL(used)}</T>
        <T variant="caption">Disponível {hidden ? '•••' : formatBRL(Math.max(0, limit - used))}</T>
      </View>
    </View>
  );
}

export function CardBadge({ card, size = 42 }: { card: CreditCard; size?: number }) {
  return (
    <View style={{ width: size, height: size * 0.7, borderRadius: radius.sm, backgroundColor: card.color, alignItems: 'center', justifyContent: 'center' }}>
      <Icon name="credit-card-chip-outline" size={size * 0.45} color="#FFFFFF" />
    </View>
  );
}
