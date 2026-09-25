import { Pressable, View } from 'react-native';

import { formatDateBR, todayISO } from '@/domain/dates';
import type { ListItem } from '@/domain/types';
import { useFinance } from '@/state/finance';
import { Amount, Icon, T } from './components';
import { space, useColors } from './theme';

export function ItemRow({ item, onPress, showDate = false }: { item: ListItem; onPress: () => void; showDate?: boolean }) {
  const c = useColors();
  const { categoryById, toggle } = useFinance();
  const cat = item.categoryId ? categoryById.get(item.categoryId) : undefined;
  const overdue = !item.paid && item.date < todayISO();

  const tags: string[] = [];
  if (cat) tags.push(cat.name);
  if (showDate) tags.push(formatDateBR(item.date));
  if (item.installmentTotal) tags.push(`${item.installmentNumber}/${item.installmentTotal}`);
  if (item.recurrenceId) tags.push('Mensal');

  const paidLabel = item.type === 'income' ? 'recebido' : 'pago';

  return (
    <Pressable onPress={onPress} style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: space.md, paddingVertical: space.sm, opacity: pressed ? 0.7 : 1 })}>
      <View style={{ width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: (cat?.color ?? c.muted) + '22' }}>
        <Icon name={cat?.icon ?? 'tag-outline'} size={20} color={cat?.color ?? c.muted} />
      </View>
      <View style={{ flex: 1, gap: 2 }}>
        <T numberOfLines={1} style={{ fontWeight: '500' }}>{item.description}</T>
        <T variant="caption" numberOfLines={1} color={overdue ? c.warning : undefined}>
          {overdue ? 'Atrasado · ' : ''}{tags.join(' · ')}
        </T>
      </View>
      <Amount cents={item.amountCents} type={item.type} signed />
      <Pressable
        accessibilityRole="checkbox"
        accessibilityState={{ checked: item.paid }}
        accessibilityLabel={item.paid ? `Marcar como não ${paidLabel}` : `Marcar como ${paidLabel}`}
        hitSlop={10}
        onPress={() => toggle(item)}
        style={{ padding: 4 }}>
        <Icon
          name={item.paid ? 'check-circle' : 'checkbox-blank-circle-outline'}
          size={26}
          color={item.paid ? c.primary : overdue ? c.warning : c.muted}
        />
      </Pressable>
    </Pressable>
  );
}
