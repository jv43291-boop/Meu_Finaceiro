import { Pressable, View } from 'react-native';

import { shortMonthLabel } from '@/domain/dates';
import { formatBRL } from '@/domain/money';
import type { BudgetLevel, MonthPoint } from '@/domain/planning';
import { Icon, T } from './components';
import { space, useColors, useHideValues } from './theme';

/**
 * Barra de progresso com estado. O estado vem SEMPRE com ícone + texto,
 * nunca só pela cor (aviso ≥ 80%, estourado > 100%).
 */
export function BudgetBar({ ratio, level, label }: { ratio: number; level: BudgetLevel; label?: string }) {
  const c = useColors();
  const color = level === 'over' ? c.danger : level === 'warn' ? c.warning : c.primary;
  const pct = Math.round(ratio * 100);
  const text = label ?? (level === 'over' ? `${pct}% · estourou` : level === 'warn' ? `${pct}% · perto do limite` : `${pct}%`);
  return (
    <View style={{ gap: 6 }}>
      <View
        accessibilityRole="progressbar"
        accessibilityValue={{ min: 0, max: 100, now: Math.min(100, pct) }}
        style={{ height: 8, borderRadius: 4, backgroundColor: c.surfaceAlt, overflow: 'hidden' }}>
        <View style={{ width: `${Math.min(1, ratio) * 100}%`, height: 8, borderRadius: 4, backgroundColor: color }} />
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
        {level !== 'ok' ? <Icon name={level === 'over' ? 'alert-circle' : 'alert'} size={14} color={color} /> : null}
        <T variant="caption" color={level === 'ok' ? undefined : color} weight={level === 'ok' ? 'medium' : 'bold'}>{text}</T>
      </View>
    </View>
  );
}

/** Barras horizontais de magnitude: um tom só (a cor de destaque); a identidade vem do ícone e do nome. */
export function HBarList({ rows, total }: { rows: { key: string; label: string; icon: string; iconColor: string; cents: number }[]; total: number }) {
  const c = useColors();
  const hidden = useHideValues();
  const max = Math.max(1, ...rows.map((r) => r.cents));
  return (
    <View style={{ gap: space.md }}>
      {rows.map((r) => {
        const share = total > 0 ? Math.round((r.cents / total) * 100) : 0;
        return (
          <View key={r.key} accessible accessibilityLabel={`${r.label}: ${formatBRL(r.cents)}, ${share}% do total`} style={{ gap: 6 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
              <Icon name={r.icon} size={18} color={r.iconColor} />
              <T variant="bodyStrong" style={{ flex: 1 }} numberOfLines={1}>{r.label}</T>
              <T variant="caption">{share}%</T>
              <T variant="bodyStrong" style={{ fontVariant: ['tabular-nums'], minWidth: 96, textAlign: 'right' }}>{hidden ? 'R$ •••' : formatBRL(r.cents)}</T>
            </View>
            <View style={{ height: 8, borderRadius: 4, backgroundColor: c.surfaceAlt }}>
              <View style={{ width: `${(r.cents / max) * 100}%`, height: 8, borderRadius: 4, backgroundColor: c.primary }} />
            </View>
          </View>
        );
      })}
    </View>
  );
}

/**
 * Receitas × despesas por mês: barras lado a lado, eixo único a partir do zero.
 * Toque num mês para ver os valores (a "dica" do gráfico no celular).
 */
export function MonthBars({ points, selected, onSelect, height = 150 }: { points: MonthPoint[]; selected: string; onSelect: (m: string) => void; height?: number }) {
  const c = useColors();
  const hidden = useHideValues();
  const max = Math.max(1, ...points.flatMap((p) => [p.incomeCents, p.expenseCents]));
  const sel = points.find((p) => p.month === selected) ?? points[points.length - 1];
  const bar = (cents: number, color: string) => (
    <View style={{ width: 12, height: Math.max(cents > 0 ? 3 : 0, (cents / max) * height), backgroundColor: color, borderTopLeftRadius: 4, borderTopRightRadius: 4 }} />
  );
  return (
    <View style={{ gap: space.md }}>
      <View style={{ flexDirection: 'row', gap: space.lg }}>
        <Legend color={c.chartIncome} label="Receitas" />
        <Legend color={c.chartExpense} label="Despesas" />
      </View>
      <View style={{ height, flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', borderBottomWidth: 1, borderBottomColor: c.border }}>
        {points.map((p) => {
          const active = p.month === sel?.month;
          return (
            <Pressable
              key={p.month}
              accessibilityRole="button"
              accessibilityState={{ selected: active }}
              accessibilityLabel={`${shortMonthLabel(p.month)}: receitas ${formatBRL(p.incomeCents)}, despesas ${formatBRL(p.expenseCents)}`}
              onPress={() => onSelect(p.month)}
              style={{ flex: 1, height, alignItems: 'center', justifyContent: 'flex-end', backgroundColor: active ? c.primarySoft : 'transparent', borderTopLeftRadius: 8, borderTopRightRadius: 8 }}>
              <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 2 }}>
                {bar(p.incomeCents, c.chartIncome)}
                {bar(p.expenseCents, c.chartExpense)}
              </View>
            </Pressable>
          );
        })}
      </View>
      <View style={{ flexDirection: 'row' }}>
        {points.map((p) => (
          <T key={p.month} variant="caption" weight={p.month === sel?.month ? 'bold' : 'medium'} color={p.month === sel?.month ? c.text : undefined} style={{ flex: 1, textAlign: 'center' }}>
            {shortMonthLabel(p.month).slice(0, 3)}
          </T>
        ))}
      </View>
      {sel ? (
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', backgroundColor: c.surfaceAlt, borderRadius: 12, padding: space.md }}>
          <View style={{ gap: 2 }}>
            <T variant="caption">{shortMonthLabel(sel.month)} · receitas</T>
            <T variant="bodyStrong">{hidden ? 'R$ •••' : formatBRL(sel.incomeCents)}</T>
          </View>
          <View style={{ gap: 2, alignItems: 'center' }}>
            <T variant="caption">despesas</T>
            <T variant="bodyStrong">{hidden ? 'R$ •••' : formatBRL(sel.expenseCents)}</T>
          </View>
          <View style={{ gap: 2, alignItems: 'flex-end' }}>
            <T variant="caption">sobra</T>
            <T variant="bodyStrong">{hidden ? 'R$ •••' : formatBRL(sel.incomeCents - sel.expenseCents)}</T>
          </View>
        </View>
      ) : null}
    </View>
  );
}

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
      <View style={{ width: 12, height: 12, borderRadius: 3, backgroundColor: color }} />
      <T variant="caption" weight="bold">{label}</T>
    </View>
  );
}
