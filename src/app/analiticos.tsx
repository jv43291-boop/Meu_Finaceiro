/** Analíticos: gráficos de gasto por dia/mês/ano, categorias, entradas × saídas e pontos de atenção. */
import { useMemo, useState } from 'react';
import { View } from 'react-native';

import { currentMonthKey, monthLabel, shiftMonth, todayISO } from '@/domain/dates';
import {
  attentionPoints,
  periodSummary,
  smallPurchases,
  spendByDay,
  spendByMonth,
  spendByYear,
  topPayees,
  type AttentionLevel,
  type Period,
} from '@/domain/insights';
import { formatBRL } from '@/domain/money';
import { monthlySeries, spendByCategory } from '@/domain/planning';
import { useFinance } from '@/state/finance';
import { HBarList, MonthBars, ValueBars } from '@/ui/Charts';
import { Card, Empty, Icon, IconButton, Segmented, Screen, T } from '@/ui/components';
import { space, useColors, useHideValues } from '@/ui/theme';

const TOP = 6;
const YEARS = 5;

export default function AnalyticsScreen() {
  const c = useColors();
  const hidden = useHideValues();
  const f = useFinance();
  const [period, setPeriod] = useState<Period>('day');
  const [month, setMonth] = useState(currentMonthKey());
  const [picked, setPicked] = useState<string | null>(null);
  const [ioPicked, setIoPicked] = useState<string | null>(null);
  const money = (cents: number) => (hidden ? 'R$ •••' : formatBRL(cents));
  const year = Number(month.slice(0, 4));

  const data = useMemo(() => {
    const today = todayISO();
    const s = { transactions: f.transactions, recurrences: f.recurrences, cards: f.cards };
    const points = period === 'day' ? spendByDay(month, s) : period === 'month' ? spendByMonth(year, s) : spendByYear(year, YEARS, s);
    const spend = spendByCategory(month, f.transactions, f.recurrences);
    const catTotal = spend.reduce((t, x) => t + x.totalCents, 0);
    const cats = spend.slice(0, TOP).map((x) => {
      const cat = x.categoryId ? f.categoryById.get(x.categoryId) : undefined;
      return { key: x.categoryId ?? 'none', label: cat?.name ?? 'Sem categoria', icon: cat?.icon ?? 'tag-outline', iconColor: cat?.color ?? c.muted, cents: x.totalCents };
    });
    const rest = spend.slice(TOP).reduce((t, x) => t + x.totalCents, 0);
    if (rest > 0) cats.push({ key: 'outras', label: `Outras (${spend.length - TOP})`, icon: 'dots-horizontal', iconColor: c.muted, cents: rest });
    return {
      points,
      summary: periodSummary(period, month, s, today),
      cats,
      catTotal,
      series: monthlySeries(month, 6, f.transactions, f.recurrences, f.cards, today),
      payees: topPayees(month, s, 5),
      small: smallPurchases(month, s),
      alerts: attentionPoints(month, s, today, (cents) => (hidden ? 'R$ •••' : formatBRL(cents))),
    };
  }, [period, month, year, f.transactions, f.recurrences, f.cards, f.categoryById, c.muted, hidden]);

  const shift = (dir: 1 | -1) => {
    setMonth((m) => (period === 'day' ? shiftMonth(m, dir) : shiftMonth(m, dir * 12)));
    setPicked(null);
  };
  const title = period === 'day' ? monthLabel(month) : period === 'month' ? String(year) : `${year - YEARS + 1} – ${year}`;
  const sum = data.summary;
  const heroLabel = period === 'day' ? `Gasto em ${monthLabel(month, false).toLowerCase()}` : `Gasto em ${year}`;
  const prevLabel = period === 'day' ? monthLabel(shiftMonth(month, -1), false).toLowerCase() : String(year - 1);
  const payeeMax = Math.max(1, ...data.payees.map((p) => p.cents));
  const monthName = monthLabel(month, false).toLowerCase();

  return (
    <Screen>
      <Segmented<Period>
        options={[{ value: 'day', label: 'Dia' }, { value: 'month', label: 'Mês' }, { value: 'year', label: 'Ano' }]}
        value={period}
        onChange={(p) => { setPeriod(p); setPicked(null); }}
      />

      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <IconButton icon="chevron-left" label="Anterior" onPress={() => shift(-1)} />
        <T variant="heading">{title}</T>
        <IconButton icon="chevron-right" label="Próximo" onPress={() => shift(1)} />
      </View>

      <Card style={{ gap: space.sm }}>
        <T variant="caption">{heroLabel}</T>
        <T variant="display" plain>{money(sum.spendCents)}</T>
        {sum.deltaPct !== null ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
            <Icon name={sum.deltaPct > 0 ? 'arrow-up' : 'arrow-down'} size={16} color={sum.deltaPct > 0 ? c.expense : c.income} />
            <T variant="bodyStrong" color={sum.deltaPct > 0 ? c.expense : c.income}>
              {Math.abs(sum.deltaPct)}% {sum.deltaPct > 0 ? 'a mais' : 'a menos'} que em {prevLabel}
            </T>
          </View>
        ) : (
          <T variant="caption">Sem gastos em {prevLabel} para comparar.</T>
        )}
        <View style={{ flexDirection: 'row', gap: space.sm, marginTop: space.xs }}>
          <Kpi label="Entradas" value={money(sum.incomeCents)} />
          <Kpi label="Sobrou" value={money(sum.leftCents)} tone={sum.leftCents < 0 ? c.danger : undefined} />
          <Kpi label="Economia" value={sum.savingRatio === null ? '—' : `${Math.round(sum.savingRatio * 100)}%`} tone={sum.savingRatio !== null && sum.savingRatio < 0 ? c.danger : undefined} />
        </View>
      </Card>

      <Card>
        <T variant="heading">{period === 'day' ? 'Gasto por dia' : period === 'month' ? 'Gasto por mês' : 'Gasto por ano'}</T>
        <T variant="caption">Toque numa barra para ver o valor · tracejado = média{period === 'day' ? ' do mês' : ''}</T>
        <ValueBars
          points={data.points}
          selected={picked}
          onSelect={setPicked}
          averageOver={period === 'day' ? 'all' : 'nonzero'}
          showTick={period === 'day' ? (i) => i === 0 || (i + 1) % 5 === 0 : undefined}
          detailLabel={(k) => (period === 'day' ? `${k.padStart(2, '0')}/${month.slice(5, 7)}` : period === 'month' ? monthLabel(k) : k)}
        />
      </Card>

      <Card>
        <T variant="heading">Por categoria</T>
        <T variant="caption">{monthLabel(month)} · total {money(data.catTotal)}</T>
        {data.cats.length ? <HBarList rows={data.cats} total={data.catTotal} /> : <Empty icon="chart-bar" title="Sem gastos neste mês" />}
      </Card>

      <Card>
        <T variant="heading">Entradas × saídas</T>
        <T variant="caption">Últimos 6 meses, pelo dia em que o dinheiro entra ou sai. Toque num mês.</T>
        <MonthBars points={data.series} selected={ioPicked ?? month} onSelect={setIoPicked} />
      </Card>

      <Card>
        <T variant="heading">Para onde vai o dinheiro</T>
        <T variant="caption">Maiores gastos de {monthName} pelo nome do lançamento</T>
        {data.payees.length ? (
          <View style={{ gap: space.md }}>
            {data.payees.map((p) => (
              <View key={p.key} accessible accessibilityLabel={`${p.label}: ${formatBRL(p.cents)} em ${p.count} vez(es)`} style={{ gap: 6 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
                  <T variant="bodyStrong" style={{ flex: 1 }} numberOfLines={1}>{p.label}</T>
                  <T variant="caption">{p.count}×</T>
                  <T variant="bodyStrong" style={{ fontVariant: ['tabular-nums'], minWidth: 96, textAlign: 'right' }}>{money(p.cents)}</T>
                </View>
                <View style={{ height: c.gamer ? 12 : 8, borderRadius: c.gamer ? 2 : 4, backgroundColor: c.surfaceAlt }}>
                  <View style={{ width: `${(p.cents / payeeMax) * 100}%`, height: c.gamer ? 12 : 8, borderRadius: c.gamer ? 2 : 4, backgroundColor: c.primary }} />
                </View>
              </View>
            ))}
          </View>
        ) : (
          <Empty icon="cash-remove" title="Nenhum gasto lançado" />
        )}
      </Card>

      <Card>
        <T variant="heading">Compras pequenas</T>
        <T variant="caption">Gastos abaixo de {formatBRL(data.small.thresholdCents)} em {monthName}</T>
        {data.small.totalCount ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.lg }}>
            <T variant="title" color={c.primaryText} style={{ fontVariant: ['tabular-nums'] }}>{data.small.count} de {data.small.totalCount}</T>
            <T variant="caption" style={{ flex: 1 }}>
              {data.small.count === 0
                ? 'Nenhuma compra pequena neste mês.'
                : `Somadas, dão ${money(data.small.cents)}. Pouco de cada vez, mas no fim do mês pesa.`}
            </T>
          </View>
        ) : (
          <T variant="caption">Nenhum gasto lançado neste mês.</T>
        )}
      </Card>

      <Card>
        <T variant="heading">Pontos de atenção</T>
        <T variant="caption">Calculados a partir dos lançamentos de {monthName}</T>
        {data.alerts.length ? (
          data.alerts.map((a) => <Alert key={a.id} level={a.level} title={a.title} detail={a.detail} />)
        ) : (
          <Empty icon="check-circle-outline" title="Nada para apontar" text="Lance seus gastos e entradas para ver os alertas do mês." />
        )}
      </Card>
    </Screen>
  );
}

function Kpi({ label, value, tone }: { label: string; value: string; tone?: string }) {
  const c = useColors();
  return (
    <View style={{ flex: 1, backgroundColor: c.surfaceAlt, borderRadius: 12, padding: space.sm + 2, gap: 2 }}>
      <T variant="bodyStrong" color={tone} numberOfLines={1} style={{ fontVariant: ['tabular-nums'] }}>{value}</T>
      <T variant="caption">{label}</T>
    </View>
  );
}

const ALERT_ICON: Record<AttentionLevel, string> = { critical: 'alert-circle', warning: 'alert', good: 'check-circle' };

/** Alerta sempre com ícone + texto (nunca só a cor). */
function Alert({ level, title, detail }: { level: AttentionLevel; title: string; detail: string }) {
  const c = useColors();
  const color = level === 'critical' ? c.danger : level === 'warning' ? c.warning : c.income;
  return (
    <View style={{ flexDirection: 'row', gap: space.md, alignItems: 'flex-start', backgroundColor: c.surfaceAlt, borderRadius: 12, padding: space.md }}>
      <Icon name={ALERT_ICON[level]} size={22} color={color} />
      <View style={{ flex: 1, gap: 2 }}>
        <T variant="bodyStrong">{title}</T>
        <T variant="caption">{detail}</T>
      </View>
    </View>
  );
}
