import { Pressable, View } from 'react-native';

import { formatDateBR, todayISO } from '@/domain/dates';
import type { ListItem } from '@/domain/types';
import { useFinance } from '@/state/finance';
import { Amount, Icon, T, tapFeedback } from './components';
import { space, useColors } from './theme';

/** framed: desenha o item sobre um cartão (usado quando há foto de fundo atrás da lista). */
export function ItemRow({ item, onPress, showDate = false, framed = false }: { item: ListItem; onPress: () => void; showDate?: boolean; framed?: boolean }) {
  const c = useColors();
  const { categoryById, toggle } = useFinance();
  const cat = item.categoryId ? categoryById.get(item.categoryId) : undefined;
  const overdue = !item.paid && item.date < todayISO();

  const tags: string[] = [];
  if (overdue) tags.push('Atrasado');
  if (showDate) tags.push(formatDateBR(item.date).slice(0, 5));
  if (cat) tags.push(cat.name);
  if (item.installmentTotal) tags.push(`${item.installmentNumber}/${item.installmentTotal}`);
  if (item.recurrenceId) tags.push('Mensal');

  const paidLabel = item.type === 'income' ? 'recebido' : 'pago';
  const tint = cat?.color ?? c.muted;

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingVertical: 6, opacity: pressed ? 0.7 : 1 },
        framed && { backgroundColor: c.surface, borderRadius: 16, paddingHorizontal: space.md, paddingVertical: 8, marginBottom: 6 },
      ]}>
      <View style={{ width: 42, height: 42, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: tint + '22' }}>
        <Icon name={cat?.icon ?? 'tag-outline'} size={20} color={tint} />
      </View>
      <View style={{ flex: 1, gap: 2 }}>
        <T variant="bodyStrong" numberOfLines={1} style={item.paid ? { opacity: 0.7 } : undefined}>{item.description}</T>
        <T variant="caption" numberOfLines={1} color={overdue ? c.warning : undefined}>{tags.join(' · ')}</T>
      </View>
      <Amount cents={item.amountCents} type={item.type} signed />
      <Pressable
        accessibilityRole="checkbox"
        accessibilityState={{ checked: item.paid }}
        accessibilityLabel={item.paid ? `Marcar ${item.description} como não ${paidLabel}` : `Marcar ${item.description} como ${paidLabel}`}
        hitSlop={8}
        onPress={() => {
          tapFeedback(item.paid ? 'light' : 'success');
          toggle(item);
        }}
        style={{ width: 40, height: 44, alignItems: 'center', justifyContent: 'center' }}>
        <Icon
          name={item.paid ? 'check-circle' : 'checkbox-blank-circle-outline'}
          size={26}
          color={item.paid ? c.primary : overdue ? c.warning : c.muted}
        />
      </Pressable>
    </Pressable>
  );
}
