import { router } from 'expo-router';
import { useMemo } from 'react';
import { View } from 'react-native';

import { currentMonthKey, monthDiff, shortMonthLabel } from '@/domain/dates';
import { occursIn } from '@/domain/recurrence';
import type { Recurrence } from '@/domain/types';
import { useFinance } from '@/state/finance';
import { Amount, Card, Empty, ListRow, Screen, T } from '@/ui/components';
import { useColors } from '@/ui/theme';

export default function RecurrencesScreen() {
  const c = useColors();
  const { recurrences, categoryById } = useFinance();
  const month = currentMonthKey();

  const groups = useMemo(() => {
    const active = recurrences.filter((r) => !r.endMonth || monthDiff(month, r.endMonth) >= 0);
    const ended = recurrences.filter((r) => r.endMonth && monthDiff(month, r.endMonth) < 0);
    const income = active.filter((r) => r.type === 'income');
    const expense = active.filter((r) => r.type === 'expense');
    const sumNow = (list: Recurrence[]) => list.filter((r) => occursIn(r, month)).reduce((s, r) => s + r.amountCents, 0);
    return { income, expense, ended, incomeTotal: sumNow(income), expenseTotal: sumNow(expense) };
  }, [recurrences, month]);

  const row = (r: Recurrence) => {
    const cat = r.categoryId ? categoryById.get(r.categoryId) : undefined;
    const period = r.endMonth
      ? monthDiff(r.startMonth, month) < 0
        ? `começa em ${shortMonthLabel(r.startMonth)}, até ${shortMonthLabel(r.endMonth)}`
        : `até ${shortMonthLabel(r.endMonth)}`
      : 'sem data de fim';
    return (
      <ListRow
        key={r.id}
        icon={cat?.icon ?? 'calendar-sync-outline'}
        iconColor={cat?.color}
        title={r.description}
        subtitle={`Todo dia ${r.day} · ${period}`}
        right={<Amount cents={r.amountCents} type={r.type} />}
        onPress={() => router.push({ pathname: '/recorrencia/[id]', params: { id: r.id } })}
      />
    );
  };

  return (
    <Screen>
        <T variant="title">Fixos</T>
        <T variant="caption">
          Receitas e contas que se repetem. Elas aparecem sozinhas em todos os meses; você só marca como pago.
        </T>

        {recurrences.length === 0 ? (
          <Empty icon="calendar-sync-outline" title="Nenhuma recorrência" text='Ao criar um lançamento, escolha "Todo mês" em Repetição.' />
        ) : (
          <>
            <View style={{ backgroundColor: c.hero, borderRadius: 22, padding: 20, gap: 6 }}>
              <T variant="caption" color={c.heroMuted}>Sobra fixa por mês</T>
              <Amount size="title" cents={groups.incomeTotal - groups.expenseTotal} color={groups.incomeTotal >= groups.expenseTotal ? c.spark : '#FFB4AD'} />
              <T variant="caption" color={c.heroMuted}>Receitas fixas menos despesas fixas deste mês.</T>
            </View>
            <Card>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                <T variant="heading">Receitas fixas</T>
                <Amount cents={groups.incomeTotal} type="income" />
              </View>
              {groups.income.length ? groups.income.map(row) : <T variant="caption">Nenhuma.</T>}
            </Card>
            <Card>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                <T variant="heading">Despesas fixas</T>
                <Amount cents={groups.expenseTotal} type="expense" />
              </View>
              {groups.expense.length ? groups.expense.map(row) : <T variant="caption">Nenhuma.</T>}
            </Card>
            {groups.ended.length > 0 && (
              <Card>
                <T variant="heading">Encerradas</T>
                {groups.ended.map(row)}
              </Card>
            )}
          </>
        )}
    </Screen>
  );
}
