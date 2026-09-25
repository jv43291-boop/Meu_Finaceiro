import { router } from 'expo-router';
import { useMemo } from 'react';
import { Pressable, View } from 'react-native';

import { currentInvoiceMonth, invoiceFor, usedLimit } from '@/domain/cards';
import { formatDateBR, shortMonthLabel, todayISO } from '@/domain/dates';
import { useFinance } from '@/state/finance';
import { CardBadge, LimitBar } from '@/ui/CardVisual';
import { Amount, Button, Card, Empty, Pill, Screen, T } from '@/ui/components';
import { space } from '@/ui/theme';

export default function CardsScreen() {
  const { cards, transactions, recurrences } = useFinance();
  const today = todayISO();
  const rows = useMemo(() => {
    const state = { cards, transactions, recurrences };
    return cards
      .filter((k) => !k.archived)
      .map((k) => {
        const month = currentInvoiceMonth(k, today);
        return { card: k, month, invoice: invoiceFor(k, month, state, today), used: usedLimit(k, state, today) };
      });
  }, [cards, transactions, recurrences, today]);

  return (
    <Screen>
      {rows.length === 0 ? (
        <Card>
          <Empty icon="credit-card-plus-outline" title="Nenhum cartão" text="Cadastre seu cartão com o dia de fechamento e de vencimento. As compras entram sozinhas na fatura certa." />
        </Card>
      ) : (
        rows.map(({ card, month, invoice, used }) => (
          <Pressable key={card.id} onPress={() => router.push({ pathname: '/cartao/[id]', params: { id: card.id } })}>
            <Card>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.md }}>
                <CardBadge card={card} />
                <View style={{ flex: 1, gap: 2 }}>
                  <T variant="bodyStrong">{card.name}</T>
                  <T variant="caption">Fecha dia {card.closingDay} · vence dia {card.dueDay}</T>
                </View>
                <Pill tone="primary" label={`fatura ${shortMonthLabel(month)}`} />
              </View>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end' }}>
                <View style={{ gap: 2 }}>
                  <T variant="caption">Fatura atual</T>
                  <Amount cents={invoice.totalCents} size="heading" type="expense" />
                </View>
                <T variant="caption">vence {formatDateBR(invoice.dueDate).slice(0, 5)}</T>
              </View>
              {card.limitCents > 0 ? <LimitBar used={used} limit={card.limitCents} /> : null}
            </Card>
          </Pressable>
        ))
      )}
      <Button title="Novo cartão" icon="plus" onPress={() => router.push('/cartao/editar')} />
    </Screen>
  );
}
