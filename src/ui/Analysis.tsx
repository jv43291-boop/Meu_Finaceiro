/** Telas da análise do mês. Todo número vem de src/domain/analysis.ts e projection.ts. */
import { router } from 'expo-router';
import { useMemo } from 'react';
import { Pressable, View } from 'react-native';

import { compareMonths, fixedExpenses, futureInstallments, incomeCommitment, nextInvoice } from '@/domain/analysis';
import { shortMonthLabel, todayISO, type MonthKey } from '@/domain/dates';
import { formatBRL } from '@/domain/money';
import { projectBalance } from '@/domain/projection';
import { useFinance } from '@/state/finance';
import { Card, Empty, Icon, T } from './components';
import { space, useColors, useHideValues } from './theme';

function useMoney() {
  const hidden = useHideValues();
  return (cents: number) => (hidden ? 'R$ •••' : formatBRL(cents));
}

/** "O que mudou": maiores variações de gasto por categoria contra o mês anterior. */
export function MonthChanges({ month, limit = 6, compact = false }: { month: MonthKey; limit?: number; compact?: boolean }) {
  const c = useColors();
  const money = useMoney();
  const f = useFinance();
  const today = todayISO();
  const cmp = useMemo(() => compareMonths(month, f, today), [month, f, today]);
  const rows = cmp.categories.filter((r) => r.deltaCents !== 0).slice(0, limit);
  const totalDelta = cmp.expenseCents - cmp.previousExpenseCents;

  if (compact && (cmp.previousExpenseCents === 0 || rows.length === 0)) return null;

  const body = (
    <>
      <View style={{ gap: 2 }}>
        <T variant="heading">{compact ? 'O que mudou este mês?' : `Comparado com ${shortMonthLabel(cmp.previous)}`}</T>
        <T variant="caption">
          Gastos {totalDelta === 0 ? 'iguais' : totalDelta > 0 ? `${money(totalDelta)} a mais` : `${money(-totalDelta)} a menos`} que em {shortMonthLabel(cmp.previous)} (inclui o previsto até o fim do mês).
        </T>
      </View>
      {rows.length === 0 ? (
        <Empty icon="scale-balance" title="Sem variação" text="Nenhuma categoria mudou em relação ao mês anterior." />
      ) : (
        rows.map((r) => {
          const cat = r.categoryId ? f.categoryById.get(r.categoryId) : undefined;
          const up = r.deltaCents > 0;
          const tone = up ? c.expense : c.income;
          return (
            <View key={r.categoryId ?? 'none'} style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm, paddingVertical: 4 }}>
              <Icon name={cat?.icon ?? 'tag-outline'} size={20} color={cat?.color ?? c.muted} />
              <View style={{ flex: 1 }}>
                <T variant="bodyStrong" numberOfLines={1}>{cat?.name ?? 'Sem categoria'}</T>
                <T variant="caption">{money(r.previousCents)} → {money(r.currentCents)}</T>
              </View>
              <View style={{ alignItems: 'flex-end' }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 2 }}>
                  <Icon name={up ? 'arrow-up' : 'arrow-down'} size={14} color={tone} />
                  <T variant="bodyStrong" color={tone}>{up ? '+' : '−'}{money(Math.abs(r.deltaCents))}</T>
                </View>
                <T variant="caption">{r.deltaPct === null ? 'novo' : `${r.deltaPct > 0 ? '+' : ''}${r.deltaPct.toLocaleString('pt-BR')}%`}</T>
              </View>
            </View>
          );
        })
      )}
      {compact ? <T variant="caption" color={c.primaryText}>Ver o relatório completo</T> : null}
    </>
  );

  return compact ? (
    <Pressable accessibilityRole="button" onPress={() => router.push('/relatorios')}>
      <Card style={{ gap: space.sm }}>{body}</Card>
    </Pressable>
  ) : (
    <Card style={{ gap: space.sm }}>{body}</Card>
  );
}

/** Indicadores objetivos do mês (sem "nota de saúde financeira"). */
export function MonthIndicators({ month }: { month: MonthKey }) {
  const c = useColors();
  const money = useMoney();
  const f = useFinance();
  const today = todayISO();
  const data = useMemo(() => {
    const state = { transactions: f.transactions, recurrences: f.recurrences, cards: f.cards };
    return {
      commit: incomeCommitment(month, state, today),
      fixed: fixedExpenses(month, state),
      inst: futureInstallments(month, state),
      invoice: nextInvoice(state, today),
      proj30: projectBalance({ ...state, accounts: f.accounts }, today, [30]).total.points[0],
    };
  }, [month, f.transactions, f.recurrences, f.cards, f.accounts, today]);

  const pct = data.commit.ratio === null ? null : Math.round(data.commit.ratio * 100);
  return (
    <Card style={{ gap: space.md }}>
      <T variant="heading">Indicadores do mês</T>
      <Indicator
        icon="percent-outline"
        label="Comprometimento da renda"
        value={pct === null ? 'sem receita' : `${pct}%`}
        tone={pct !== null && pct > 100 ? c.danger : undefined}
        detail={
          pct === null
            ? 'Não há receita neste mês para comparar.'
            : `Fixos ${money(data.commit.fixedCents)} + parcelas ${money(data.commit.installmentsCents)} + faturas ${money(data.commit.invoicesCents)} de ${money(data.commit.incomeCents)} de receitas.`
        }
      />
      <Indicator icon="calendar-sync-outline" label="Despesas fixas" value={money(data.fixed.totalCents)} detail={`${data.fixed.count} conta(s) fixa(s) no mês, na conta e no cartão.`} />
      <Indicator
        icon="credit-card-clock-outline"
        label="Parcelas futuras"
        value={money(data.inst.totalCents)}
        detail={data.inst.count ? `${data.inst.count} parcela(s) depois deste mês, até ${shortMonthLabel(data.inst.lastMonth!)}.` : 'Nenhuma parcela a vencer depois deste mês.'}
      />
      <Indicator
        icon="credit-card-outline"
        label="Próxima fatura"
        value={data.invoice ? money(data.invoice.amountCents) : '—'}
        detail={data.invoice ? `${data.invoice.description} · vence ${data.invoice.dueDate.slice(8, 10)}/${data.invoice.dueDate.slice(5, 7)}` : 'Nenhuma fatura em aberto.'}
      />
      {data.proj30 ? (
        <Indicator
          icon="chart-timeline-variant"
          label="Saldo previsto em 30 dias"
          value={money(data.proj30.balanceCents)}
          tone={data.proj30.balanceCents < 0 ? c.danger : undefined}
          detail="Todas as contas, sem os atrasados. Detalhes no Início."
        />
      ) : null}
    </Card>
  );
}

function Indicator({ icon, label, value, detail, tone }: { icon: string; label: string; value: string; detail: string; tone?: string }) {
  const c = useColors();
  return (
    <View style={{ flexDirection: 'row', gap: space.md, alignItems: 'flex-start' }}>
      <Icon name={icon} size={22} color={c.primaryText} />
      <View style={{ flex: 1, gap: 2 }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: space.sm }}>
          <T variant="bodyStrong" style={{ flex: 1 }}>{label}</T>
          <T variant="bodyStrong" color={tone}>{value}</T>
        </View>
        <T variant="caption">{detail}</T>
      </View>
    </View>
  );
}
