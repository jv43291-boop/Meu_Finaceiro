import { useMemo, useState } from 'react';
import { View } from 'react-native';

import { currentMonthKey, monthLabel, todayISO } from '@/domain/dates';
import { formatBRL } from '@/domain/money';
import { budgetLines, budgetTotals, monthlySeries, spendByCategory } from '@/domain/planning';
import { useFinance } from '@/state/finance';
import { HBarList, MonthBars } from '@/ui/Charts';
import { Card, Empty, MonthSwitcher, Screen, T } from '@/ui/components';
import { useColors, useHideValues } from '@/ui/theme';

const TOP = 7;

export default function ReportsScreen() {
  const c = useColors();
  const hidden = useHideValues();
  const f = useFinance();
  const [month, setMonth] = useState(currentMonthKey());
  const [picked, setPicked] = useState<string | null>(null);

  const data = useMemo(() => {
    const today = todayISO();
    const spend = spendByCategory(month, f.transactions, f.recurrences);
    const total = spend.reduce((s, x) => s + x.totalCents, 0);
    const rows = spend.slice(0, TOP).map((s) => {
      const cat = s.categoryId ? f.categoryById.get(s.categoryId) : undefined;
      return { key: s.categoryId ?? 'none', label: cat?.name ?? 'Sem categoria', icon: cat?.icon ?? 'tag-outline', iconColor: cat?.color ?? c.muted, cents: s.totalCents };
    });
    const rest = spend.slice(TOP).reduce((s, x) => s + x.totalCents, 0);
    if (rest > 0) rows.push({ key: 'outras', label: `Outras (${spend.length - TOP})`, icon: 'dots-horizontal', iconColor: c.muted, cents: rest });
    const series = monthlySeries(month, 6, f.transactions, f.recurrences, f.cards, today);
    const budget = budgetTotals(budgetLines(month, f.categories, f.transactions, f.recurrences));
    return { rows, total, series, budget };
  }, [month, f.transactions, f.recurrences, f.cards, f.categories, f.categoryById, c.muted]);

  const money = (cents: number) => (hidden ? 'R$ •••' : formatBRL(cents));

  return (
    <Screen>
      <MonthSwitcher month={month} onChange={(m) => { setMonth(m); setPicked(null); }} />

      <Card>
        <T variant="heading">Gastos por categoria</T>
        <T variant="caption">{monthLabel(month)} · total {money(data.total)} (inclui cartão pela data da compra e contas fixas previstas)</T>
        {data.rows.length ? <HBarList rows={data.rows} total={data.total} /> : <Empty icon="chart-bar" title="Sem gastos neste mês" />}
      </Card>

      <Card>
        <T variant="heading">Receitas × despesas</T>
        <T variant="caption">Últimos 6 meses, pelo dia em que o dinheiro entra ou sai (faturas no vencimento). Toque num mês.</T>
        <MonthBars points={data.series} selected={picked ?? month} onSelect={setPicked} />
      </Card>

      {data.budget.budgetCents > 0 ? (
        <Card>
          <T variant="heading">Orçado × gasto</T>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
            <View style={{ gap: 2 }}>
              <T variant="caption">Orçado</T>
              <T variant="bodyStrong">{money(data.budget.budgetCents)}</T>
            </View>
            <View style={{ gap: 2, alignItems: 'flex-end' }}>
              <T variant="caption">Gasto + previsto</T>
              <T variant="bodyStrong">{money(data.budget.plannedCents)}</T>
            </View>
          </View>
          <T variant="caption">
            {data.budget.over ? `${data.budget.over} categoria(s) passaram do limite. ` : 'Nenhuma categoria passou do limite. '}
            {data.budget.warn ? `${data.budget.warn} perto do limite.` : ''}
          </T>
        </Card>
      ) : null}
    </Screen>
  );
}
