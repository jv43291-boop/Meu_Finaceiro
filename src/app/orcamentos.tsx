import { useMemo, useState } from 'react';
import { View } from 'react-native';

import { currentMonthKey, monthLabel, todayISO } from '@/domain/dates';
import { formatBRL } from '@/domain/money';
import { budgetLines, budgetTotals, monthProgress, spendByCategory, budgetLevel } from '@/domain/planning';
import type { Category } from '@/domain/types';
import { ctx, useFinance } from '@/state/finance';
import { BudgetBar } from '@/ui/Charts';
import { Amount, Card, ListRow, MonthSwitcher, Screen, T } from '@/ui/components';
import { MoneySheet } from '@/ui/MoneySheet';
import { space, useColors, useHideValues } from '@/ui/theme';

export default function BudgetsScreen() {
  const c = useColors();
  const hidden = useHideValues();
  const f = useFinance();
  const [month, setMonth] = useState(currentMonthKey());
  const [editing, setEditing] = useState<Category | null>(null);

  const { lines, totals, without, progress } = useMemo(() => {
    const lines = budgetLines(month, f.categories, f.transactions, f.recurrences);
    const spend = new Map(spendByCategory(month, f.transactions, f.recurrences).map((s) => [s.categoryId, s.totalCents]));
    const without = f.categories
      .filter((k) => k.type === 'expense' && !k.archived && !k.budgetCents)
      .map((k) => ({ category: k, cents: spend.get(k.id) ?? 0 }))
      .sort((a, b) => b.cents - a.cents);
    return { lines, totals: budgetTotals(lines), without, progress: monthProgress(month, todayISO()) };
  }, [month, f.categories, f.transactions, f.recurrences]);

  const money = (cents: number) => (hidden ? 'R$ •••' : formatBRL(cents));
  const totalRatio = totals.budgetCents ? totals.plannedCents / totals.budgetCents : 0;

  return (
    <Screen>
      <MonthSwitcher month={month} onChange={setMonth} />

      {lines.length > 0 ? (
        <Card>
          <T variant="label">Gasto e previsto em {monthLabel(month, false).toLowerCase()}</T>
          <View style={{ flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between' }}>
            <Amount cents={totals.plannedCents} size="title" />
            <T variant="caption">de {money(totals.budgetCents)}</T>
          </View>
          <BudgetBar ratio={totalRatio} level={budgetLevel(totalRatio)} />
          {progress > 0 && progress < 1 ? (
            <T variant="caption">
              {Math.round(progress * 100)}% do mês já passou. {totals.over ? `${totals.over} categoria(s) estourada(s). ` : ''}
              {totals.warn ? `${totals.warn} perto do limite.` : ''}
            </T>
          ) : null}
        </Card>
      ) : (
        <Card>
          <T variant="heading">Defina quanto quer gastar</T>
          <T variant="caption">Toque numa categoria abaixo para colocar um limite por mês. O app avisa quando passar de 80%.</T>
        </Card>
      )}

      {lines.length > 0 ? (
        <Card style={{ gap: space.lg }}>
          <T variant="heading">Com orçamento</T>
          {lines.map((l) => (
            <View key={l.category.id} style={{ gap: 6 }}>
              <ListRow
                icon={l.category.icon}
                iconColor={l.category.color}
                title={l.category.name}
                subtitle={`${money(l.plannedCents)} de ${money(l.budgetCents)}`}
                onPress={() => setEditing(l.category)}
              />
              <BudgetBar
                ratio={l.ratio}
                level={l.level}
                label={`${Math.round(l.ratio * 100)}% · ${l.remainingCents >= 0 ? `sobram ${money(l.remainingCents)}` : `passou ${money(-l.remainingCents)}`}`}
              />
            </View>
          ))}
          <T variant="caption">Conta tudo do mês: o que já foi pago, as compras no cartão e as contas fixas previstas.</T>
        </Card>
      ) : null}

      <Card style={{ gap: 4 }}>
        <T variant="heading" style={{ paddingBottom: 6 }}>Sem orçamento</T>
        {without.map(({ category, cents }) => (
          <ListRow
            key={category.id}
            icon={category.icon}
            iconColor={category.color}
            title={category.name}
            subtitle={cents ? `${money(cents)} neste mês` : 'Nada neste mês'}
            right={<T variant="caption" color={c.primaryText} weight="bold">Definir</T>}
            onPress={() => setEditing(category)}
          />
        ))}
      </Card>

      <MoneySheet
        visible={!!editing}
        title={editing ? `Orçamento de ${editing.name}` : ''}
        hint="Quanto você quer gastar por mês nesta categoria. Deixe vazio para remover."
        initialCents={editing?.budgetCents ?? null}
        allowEmpty
        confirmLabel="Salvar orçamento"
        onClose={() => setEditing(null)}
        onConfirm={async (cents) => {
          if (!editing) return;
          await f.saveCategory({ ...editing, budgetCents: cents, updatedAt: ctx.now() });
          setEditing(null);
        }}
      />
    </Screen>
  );
}
