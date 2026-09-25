import { Pressable, View } from 'react-native';

import { formatDateBR, todayISO } from '@/domain/dates';
import type { ListItem } from '@/domain/types';
import { useFinance } from '@/state/finance';
import { Amount, Icon, T, tapFeedback } from './components';
import { space, useColors } from './theme';

/** framed: desenha o item sobre um cartão (usado quando há foto de fundo atrás da lista). */
export function ItemRow({
  item,
  onPress,
  showDate = false,
  framed = false,
}: {
  item: ListItem;
  onPress: () => void;
  showDate?: boolean;
  framed?: boolean;
}) {
  const c = useColors();
  const { categoryById, toggle, cardById } = useFinance();
  const card = item.cardId ? cardById.get(item.cardId) : undefined;
  const isInvoice = item.invoice || item.invoicePayment;
  const cat = !isInvoice && item.categoryId ? categoryById.get(item.categoryId) : undefined;
  const overdue = !item.paid && item.date < todayISO();

  const tags: string[] = [];
  if (overdue) tags.push('Atrasado');
  if (showDate) tags.push(formatDateBR(item.date).slice(0, 5));
  if (isInvoice) tags.push(item.paid ? 'Fatura paga' : 'Fatura do cartão');
  else if (cat) tags.push(cat.name);
  if (card && !isInvoice) tags.push(card.name);
  if (item.installmentTotal) tags.push(`${item.installmentNumber}/${item.installmentTotal}`);
  if (item.recurrenceId) tags.push('Mensal');

  const paidLabel = item.type === 'income' ? 'recebido' : 'pago';
  const tint = isInvoice ? (card?.color ?? c.primary) : (cat?.color ?? c.muted);
  const iconName = isInvoice ? 'credit-card-outline' : (cat?.icon ?? 'tag-outline');
  const canToggle = !(item.cardId && !isInvoice); // compra no cartão não se marca como paga

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        {
          flexDirection: 'row',
          alignItems: 'center',
          gap: space.md,
          paddingVertical: 6,
          opacity: pressed ? 0.7 : 1,
        },
        framed && {
          backgroundColor: c.surface,
          borderRadius: 16,
          paddingHorizontal: space.md,
          paddingVertical: 8,
          marginBottom: 6,
        },
      ]}>
      <View
        style={{
          width: 42,
          height: 42,
          borderRadius: 14,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: tint + '22',
        }}>
        <Icon name={iconName} size={20} color={tint} />
      </View>
      <View style={{ flex: 1, gap: 2 }}>
        <T variant="bodyStrong" numberOfLines={1} style={item.paid ? { opacity: 0.7 } : undefined}>
          {item.description}
        </T>
        <T variant="caption" numberOfLines={1} color={overdue ? c.warning : undefined}>
          {tags.join(' · ')}
        </T>
      </View>
      <Amount cents={item.amountCents} type={item.type} signed />
      {canToggle ? (
        <Pressable
          accessibilityRole="checkbox"
          accessibilityState={{ checked: item.paid }}
          accessibilityLabel={item.paid ? `Marcar ${item.description} como não ${paidLabel}` : `Marcar ${item.description} como ${paidLabel}`}
          hitSlop={8}
          onPress={() => {
            tapFeedback(item.paid ? 'light' : 'success');
            toggle(item);
          }}
          style={{
            width: 40,
            height: 44,
            alignItems: 'center',
            justifyContent: 'center',
          }}>
          <Icon
            name={item.paid ? 'check-circle' : 'checkbox-blank-circle-outline'}
            size={26}
            color={item.paid ? c.primary : overdue ? c.warning : c.muted}
          />
        </Pressable>
      ) : (
        <View style={{ width: 40 }} />
      )}
    </Pressable>
  );
}
