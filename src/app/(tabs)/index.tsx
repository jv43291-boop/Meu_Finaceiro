import { router } from 'expo-router';
import { useMemo } from 'react';
import { Pressable, View } from 'react-native';

import { currentMonthKey, dayOf, daysInMonth, monthLabel, todayISO } from '@/domain/dates';
import { currentInvoiceMonth, invoiceFor } from '@/domain/cards';
import { budgetLevel, budgetLines, budgetTotals, goalPlan } from '@/domain/planning';
import { cashItemsForMonth, overview, summarizeItems } from '@/domain/summary';
import { useFinance } from '@/state/finance';
import { Amount, Card, Empty, IconButton, ListRow, Pill, Screen, T } from '@/ui/components';
import { BudgetBar } from '@/ui/Charts';
import { ItemRow } from '@/ui/ItemRow';
import { openItem } from '@/ui/nav';
import { radius, space, useAppTheme, useColors } from '@/ui/theme';

function greeting(hour: number) {
  if (hour < 5) return 'Boa noite';
  if (hour < 12) return 'Bom dia';
  if (hour < 18) return 'Boa tarde';
  return 'Boa noite';
}

export default function HomeScreen() {
  const c = useColors();
  const { hideValues, toggleHideValues, scheme } = useAppTheme();
  const { accounts, transactions, recurrences, cards, categories, goals } = useFinance();
  const month = currentMonthKey();
  const today = todayISO();

  const { ov, sum, cardRows, budget, topGoal } = useMemo(() => {
    const ov = overview(accounts, transactions, recurrences, { today, upcomingDays: 7, cards });
    const sum = summarizeItems(cashItemsForMonth(month, transactions, recurrences, cards, today));
    const state = { cards, transactions, recurrences };
    const cardRows = cards
      .filter((k) => !k.archived)
      .map((k) => ({ card: k, invoice: invoiceFor(k, currentInvoiceMonth(k, today), state, today) }));
    const lines = budgetLines(month, categories, transactions, recurrences);
    const budget = { totals: budgetTotals(lines), alerts: lines.filter((l) => l.level !== 'ok').slice(0, 3) };
    const topGoal = goals.filter((g) => !g.archived && !goalPlan(g, today).done)[0] ?? null;
    return { ov, sum, cardRows, budget, topGoal };
  }, [accounts, transactions, recurrences, cards, categories, goals, month, today]);

  const daysLeft = daysInMonth(month) - dayOf(today);
  const lastDay = daysInMonth(month);
  const attention = [...ov.overdue, ...ov.upcoming].slice(0, 8);
  const empty = transactions.length === 0 && recurrences.length === 0;

  return (
    <Screen>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <View style={{ gap: 2 }}>
          <T variant="caption">{greeting(new Date().getHours())}</T>
          <T variant="title">Live</T>
        </View>
        <View style={{ flexDirection: 'row', gap: space.sm }}>
          <IconButton icon={hideValues ? 'eye-off-outline' : 'eye-outline'} label={hideValues ? 'Mostrar valores' : 'Esconder valores'} onPress={toggleHideValues} />
          <IconButton icon={scheme === 'dark' ? 'weather-night' : 'white-balance-sunny'} label="Aparência" onPress={() => router.push('/aparencia')} />
        </View>
      </View>

      <View style={{ backgroundColor: c.hero, borderRadius: radius.xl, padding: 22, gap: 14 }}>
        <T variant="caption" color={c.heroMuted}>Saldo em contas</T>
        <Amount cents={ov.balance} size="display" color={c.onHero} />
        <View style={{ height: 1, backgroundColor: c.heroLine }} />
        <View style={{ flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', gap: space.md }}>
          <View style={{ gap: 2, flex: 1 }}>
            <T variant="caption" color={c.heroMuted}>Sobra até {lastDay} de {monthLabel(month, false).toLowerCase()}</T>
            <Amount cents={ov.forecast} size="amount" color={ov.forecast < 0 ? '#FFB4AD' : c.spark} />
          </View>
          <Pill tone="hero" label={daysLeft === 0 ? 'último dia' : daysLeft === 1 ? '1 dia' : `${daysLeft} dias`} />
        </View>
      </View>

      <View style={{ flexDirection: 'row', gap: space.md }}>
        <Card style={{ flex: 1, gap: 6 }}>
          <T variant="caption">A receber</T>
          <Amount cents={ov.pendingIncome} type="income" size="heading" />
        </Card>
        <Card style={{ flex: 1, gap: 6 }}>
          <T variant="caption">A pagar</T>
          <Amount cents={ov.pendingExpense} type="expense" size="heading" />
        </Card>
      </View>

      {empty ? (
        <Card>
          <Empty icon="wallet-plus-outline" title="Comece pelo botão +" text="Cadastre seu salário e suas contas fixas como “Todo mês”: elas aparecem sozinhas em todos os meses." />
        </Card>
      ) : (
        <Card style={{ gap: 4 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingBottom: 6 }}>
            <T variant="heading">Precisa de atenção</T>
            {ov.overdue.length > 0 ? <Pill label={ov.overdue.length === 1 ? '1 atrasado' : `${ov.overdue.length} atrasados`} /> : null}
          </View>
          {attention.length === 0 ? (
            <T variant="caption">Nada atrasado e nada vencendo nos próximos 7 dias.</T>
          ) : (
            attention.map((it) => <ItemRow key={it.key} item={it} showDate onPress={() => openItem(it)} />)
          )}
          {ov.overdue.length + ov.upcoming.length > attention.length ? (
            <T variant="caption" style={{ paddingTop: 6 }}>Veja o restante na aba Extrato.</T>
          ) : null}
        </Card>
      )}

      {budget.totals.budgetCents > 0 || topGoal ? (
        <Card style={{ gap: space.md }}>
          <T variant="heading">Planejamento</T>
          {budget.totals.budgetCents > 0 ? (
            <Pressable onPress={() => router.push('/orcamentos')} style={{ gap: 6 }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                <T variant="bodyStrong">Orçamento do mês</T>
                <Amount cents={budget.totals.plannedCents} />
              </View>
              <BudgetBar ratio={budget.totals.plannedCents / budget.totals.budgetCents} level={budgetLevel(budget.totals.plannedCents / budget.totals.budgetCents)} />
              {budget.alerts.map((l) => (
                <T key={l.category.id} variant="caption" color={l.level === 'over' ? c.danger : c.warning}>
                  {l.category.name}: {Math.round(l.ratio * 100)}% do orçamento
                </T>
              ))}
            </Pressable>
          ) : null}
          {topGoal ? (
            <Pressable onPress={() => router.push({ pathname: '/meta/[id]', params: { id: topGoal.id } })} style={{ gap: 6 }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                <T variant="bodyStrong">{topGoal.name}</T>
                <Amount cents={topGoal.savedCents} />
              </View>
              <BudgetBar ratio={goalPlan(topGoal, today).pct} level="ok" label={`${Math.round(goalPlan(topGoal, today).pct * 100)}% da meta`} />
            </Pressable>
          ) : null}
        </Card>
      ) : null}

      {cardRows.length > 0 ? (
        <Card style={{ gap: 4 }}>
          <T variant="heading" style={{ paddingBottom: 6 }}>Cartões</T>
          {cardRows.map(({ card, invoice }) => (
            <ListRow
              key={card.id}
              icon="credit-card-outline"
              iconColor={card.color}
              title={card.name}
              subtitle={`Fatura atual · vence ${invoice.dueDate.slice(8, 10)}/${invoice.dueDate.slice(5, 7)}`}
              right={<Amount cents={invoice.totalCents} type="expense" />}
              onPress={() => router.push({ pathname: '/cartao/[id]', params: { id: card.id, mes: invoice.month } })}
            />
          ))}
        </Card>
      ) : null}

      <Card>
        <T variant="heading">{monthLabel(month)}</T>
        <Row label="Receitas" cents={sum.income} type="income" hint={sum.incomeReceived} hintLabel="recebido" />
        <Row label="Despesas" cents={sum.expense} type="expense" hint={sum.expensePaid} hintLabel="pago" />
        <View style={{ height: 1, backgroundColor: c.border }} />
        <Row label="Resultado do mês" cents={Math.abs(sum.result)} type={sum.result >= 0 ? 'income' : 'expense'} />
      </Card>
    </Screen>
  );
}

function Row({ label, cents, type, hint, hintLabel }: { label: string; cents: number; type: 'income' | 'expense'; hint?: number; hintLabel?: string }) {
  const c = useColors();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center' }}>
      <View style={{ flex: 1, gap: 2 }}>
        <T variant="bodyStrong">{label}</T>
        {hint !== undefined ? (
          <View style={{ flexDirection: 'row', gap: 4 }}>
            <Amount cents={hint} size="caption" color={c.muted} />
            <T variant="caption">{hintLabel}</T>
          </View>
        ) : null}
      </View>
      <Amount cents={cents} type={type} />
    </View>
  );
}
