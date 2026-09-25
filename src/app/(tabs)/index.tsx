import { router } from 'expo-router';
import { useMemo } from 'react';
import { View } from 'react-native';

import { currentMonthKey, monthLabel, todayISO } from '@/domain/dates';
import { formatBRL } from '@/domain/money';
import { itemsForMonth } from '@/domain/recurrence';
import { overview, summarizeItems } from '@/domain/summary';
import { useFinance } from '@/state/finance';
import { Amount, Card, Empty, Fab, Screen, T } from '@/ui/components';
import { ItemRow } from '@/ui/ItemRow';
import { space, useColors } from '@/ui/theme';

export default function HomeScreen() {
  const c = useColors();
  const { accounts, transactions, recurrences } = useFinance();
  const month = currentMonthKey();

  const data = useMemo(() => {
    const ov = overview(accounts, transactions, recurrences, { today: todayISO(), upcomingDays: 7 });
    const sum = summarizeItems(itemsForMonth(month, transactions, recurrences));
    return { ov, sum };
  }, [accounts, transactions, recurrences, month]);

  const { ov, sum } = data;
  const open = (key: string) => router.push({ pathname: '/lancamento/[key]', params: { key } });

  return (
    <View style={{ flex: 1 }}>
      <Screen>
        <T variant="title">Meu Financeiro</T>

        <Card style={{ backgroundColor: c.navy, borderColor: c.navy }}>
          <T variant="caption" color="#FFFFFFB3">Saldo em contas agora</T>
          <T variant="title" color={c.onNavy} style={{ fontVariant: ['tabular-nums'] }}>
            {formatBRL(ov.balance)}
          </T>
          <View style={{ height: 1, backgroundColor: '#FFFFFF22' }} />
          <T variant="caption" color="#FFFFFFB3">Previsto para o fim de {monthLabel(month, false).toLowerCase()}</T>
          <T variant="amount" color={ov.forecast < 0 ? '#FF9C94' : '#7BE8C6'} style={{ fontVariant: ['tabular-nums'] }}>
            {formatBRL(ov.forecast)}
          </T>
          <T variant="caption" color="#FFFFFFB3">
            Considera o que ainda falta receber e pagar, inclusive o que está atrasado.
          </T>
        </Card>

        <View style={{ flexDirection: 'row', gap: space.md }}>
          <Card style={{ flex: 1 }}>
            <T variant="label">A receber</T>
            <Amount cents={ov.pendingIncome} type="income" />
          </Card>
          <Card style={{ flex: 1 }}>
            <T variant="label">A pagar</T>
            <Amount cents={ov.pendingExpense} type="expense" />
          </Card>
        </View>

        {ov.overdue.length > 0 && (
          <Card style={{ borderColor: c.warning }}>
            <T variant="heading" color={c.warning}>Atrasados ({ov.overdue.length})</T>
            <T variant="caption">Toque no círculo para marcar como pago ou recebido.</T>
            {ov.overdue.slice(0, 8).map((it) => (
              <ItemRow key={it.key} item={it} showDate onPress={() => open(it.key)} />
            ))}
          </Card>
        )}

        <Card>
          <T variant="heading">Próximos 7 dias</T>
          {ov.upcoming.length === 0 ? (
            <T variant="caption">Nada vencendo nos próximos dias.</T>
          ) : (
            ov.upcoming.map((it) => <ItemRow key={it.key} item={it} showDate onPress={() => open(it.key)} />)
          )}
        </Card>

        <Card>
          <T variant="heading">{monthLabel(month)}</T>
          <Row label="Receitas" cents={sum.income} type="income" hint={`${fmt(sum.incomeReceived)} recebido`} />
          <Row label="Despesas" cents={sum.expense} type="expense" hint={`${fmt(sum.expensePaid)} pago`} />
          <View style={{ height: 1, backgroundColor: c.border }} />
          <Row label="Resultado do mês" cents={Math.abs(sum.result)} type={sum.result >= 0 ? 'income' : 'expense'} />
        </Card>

        {transactions.length === 0 && recurrences.length === 0 && (
          <Empty icon="wallet-outline" title="Comece pelo botão +" text="Cadastre seu salário e suas contas fixas como mensais: elas aparecem sozinhas todo mês." />
        )}
      </Screen>
      <Fab onPress={() => router.push('/lancamento/novo')} />
    </View>
  );
}

const fmt = formatBRL;

function Row({ label, cents, type, hint }: { label: string; cents: number; type: 'income' | 'expense'; hint?: string }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center' }}>
      <View style={{ flex: 1 }}>
        <T>{label}</T>
        {hint ? <T variant="caption">{hint}</T> : null}
      </View>
      <Amount cents={cents} type={type} />
    </View>
  );
}
