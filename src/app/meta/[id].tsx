import { Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Pressable, View } from 'react-native';

import { formatDateBR, parseDateBR, todayISO } from '@/domain/dates';
import { PALETTE } from '@/domain/defaults';
import { formatBRL, formatPlain, parseMoney } from '@/domain/money';
import { goalPlan } from '@/domain/planning';
import type { Goal } from '@/domain/types';
import { ctx, useFinance } from '@/state/finance';
import { BudgetBar } from '@/ui/Charts';
import { FormScroll, Amount, Button, Card, ColorPicker, Field, Icon, Input, T, tapFeedback } from '@/ui/components';
import { confirmAsk, notify } from '@/ui/dialogs';
import { MoneySheet } from '@/ui/MoneySheet';
import { goBack } from '@/ui/nav';
import { radius, space, useColors, useHideValues } from '@/ui/theme';

const GOAL_ICONS = ['piggy-bank-outline', 'shield-check-outline', 'airplane', 'home-outline', 'car-outline', 'school-outline', 'cellphone', 'gift-outline', 'heart-outline', 'star-outline'];
const GOAL_COLORS = ['#5B45FF', '#2563EB', '#047857', '#BE185D', '#C2410C', ...PALETTE.slice(4, 8)];

export default function GoalScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const f = useFinance();
  const existing = f.goals.find((g) => g.id === id);
  return existing ? <GoalDetail goal={existing} /> : <GoalForm />;
}

function GoalDetail({ goal }: { goal: Goal }) {
  const f = useFinance();
  const hidden = useHideValues();
  const [sheet, setSheet] = useState<null | 'in' | 'out'>(null);
  const [editing, setEditing] = useState(false);
  const p = goalPlan(goal, todayISO());
  const money = (cents: number) => (hidden ? 'R$ •••' : formatBRL(cents));

  if (editing) return <GoalForm goal={goal} onDone={() => setEditing(false)} />;

  return (
    <FormScroll contentContainerStyle={{ padding: space.xl, gap: space.lg }}>
      <Stack.Screen options={{ title: goal.name }} />
      <View style={{ backgroundColor: goal.color, borderRadius: radius.xl, padding: 20, gap: 10 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
          <Icon name={goal.icon} color="#FFFFFF" />
          <T variant="bodyStrong" color="#FFFFFF">{goal.name}</T>
        </View>
        <Amount cents={goal.savedCents} size="display" color="#FFFFFF" />
        <T variant="caption" color="rgba(255,255,255,0.85)">de {money(goal.targetCents)}{goal.targetDate ? ` até ${formatDateBR(goal.targetDate)}` : ''}</T>
      </View>
      <Card>
        <BudgetBar ratio={p.pct} level="ok" label={p.done ? 'Meta concluída' : `${Math.round(p.pct * 100)}% guardado · faltam ${money(p.remainingCents)}`} />
        {!p.done && p.perMonthCents !== null ? (
          <T variant="caption">{p.late ? 'A data passou. Ajuste a data ou continue guardando.' : `Para chegar na data: ${money(p.perMonthCents)} por mês, durante ${p.monthsLeft} ${p.monthsLeft === 1 ? 'mês' : 'meses'}.`}</T>
        ) : null}
      </Card>
      <View style={{ flexDirection: 'row', gap: space.md }}>
        <Button title="Guardar" icon="plus" onPress={() => setSheet('in')} style={{ flex: 1 }} />
        <Button title="Retirar" icon="minus" variant="secondary" onPress={() => setSheet('out')} style={{ flex: 1 }} />
      </View>
      <T variant="caption">Guardar e retirar só mudam o valor da meta. Se o dinheiro saiu de uma conta, lance também uma despesa ou transferência.</T>
      <Button title="Editar meta" variant="ghost" icon="pencil-outline" onPress={() => setEditing(true)} />

      <MoneySheet
        visible={sheet !== null}
        title={sheet === 'out' ? 'Retirar da meta' : 'Guardar na meta'}
        initialCents={null}
        confirmLabel={sheet === 'out' ? 'Retirar' : 'Guardar'}
        onClose={() => setSheet(null)}
        onConfirm={async (cents) => {
          if (!cents) return;
          const next = sheet === 'out' ? Math.max(0, goal.savedCents - cents) : goal.savedCents + cents;
          await f.saveGoal({ ...goal, savedCents: next, updatedAt: ctx.now() });
          tapFeedback('success');
          setSheet(null);
        }}
      />
    </FormScroll>
  );
}

function GoalForm({ goal, onDone }: { goal?: Goal; onDone?: () => void }) {
  const c = useColors();
  const f = useFinance();
  const [name, setName] = useState(goal?.name ?? '');
  const [target, setTarget] = useState(goal ? formatPlain(goal.targetCents) : '');
  const [saved, setSaved] = useState(goal ? formatPlain(goal.savedCents) : '');
  const [date, setDate] = useState(goal?.targetDate ? formatDateBR(goal.targetDate) : '');
  const [icon, setIcon] = useState(goal?.icon ?? GOAL_ICONS[0]);
  const [color, setColor] = useState(goal?.color ?? GOAL_COLORS[0]);

  async function save() {
    const targetCents = parseMoney(target);
    const savedCents = saved.trim() ? parseMoney(saved) : 0;
    const d = date.trim() ? parseDateBR(date, Number(todayISO().slice(0, 4))) : null;
    if (!name.trim()) return notify('Revise os dados', 'Dê um nome para a meta.');
    if (!targetCents || targetCents <= 0) return notify('Revise os dados', 'Informe quanto quer juntar.');
    if (savedCents === null || savedCents < 0) return notify('Revise os dados', 'Informe um valor já guardado válido, ou deixe em branco.');
    if (date.trim() && !d) return notify('Revise os dados', 'Informe a data no formato dd/mm/aaaa, ou deixe em branco.');
    const now = ctx.now();
    await f.saveGoal({
      id: goal?.id ?? ctx.newId(), createdAt: goal?.createdAt ?? now, updatedAt: now, deletedAt: null,
      name: name.trim(), targetCents, savedCents, targetDate: d, icon, color, archived: goal?.archived ?? false,
    });
    if (onDone) onDone();
    else goBack();
  }

  async function remove() {
    if (!goal) return;
    if (!(await confirmAsk('Excluir meta?', goal.name, 'Excluir', true))) return;
    const now = ctx.now();
    await f.saveGoal({ ...goal, deletedAt: now, updatedAt: now });
    goBack();
  }

  return (
    <FormScroll contentContainerStyle={{ padding: space.xl, gap: space.xl }} keyboardShouldPersistTaps="handled">
      <Stack.Screen options={{ title: goal ? 'Editar meta' : 'Nova meta' }} />
      <Field label="Nome"><Input value={name} onChangeText={setName} placeholder="Ex.: Reserva de emergência" autoFocus={!goal} /></Field>
      <Field label="Quanto quer juntar (R$)"><Input value={target} onChangeText={setTarget} placeholder="0,00" keyboardType="decimal-pad" /></Field>
      <Field label="Já tem guardado (R$)"><Input value={saved} onChangeText={setSaved} placeholder="0,00" keyboardType="decimal-pad" /></Field>
      <Field label="Até quando" hint="Opcional. Com data, o app mostra quanto guardar por mês.">
        <Input value={date} onChangeText={setDate} placeholder="dd/mm/aaaa" keyboardType="numbers-and-punctuation" />
      </Field>
      <Field label="Ícone">
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm }}>
          {GOAL_ICONS.map((i) => (
            <Pressable key={i} accessibilityRole="radio" accessibilityState={{ selected: icon === i }} accessibilityLabel={i} onPress={() => setIcon(i)}
              style={{ width: 48, height: 48, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center', borderWidth: 1.5, borderColor: icon === i ? color : c.border, backgroundColor: icon === i ? color + '22' : c.surface }}>
              <Icon name={i} color={icon === i ? color : c.muted} />
            </Pressable>
          ))}
        </View>
      </Field>
      <Field label="Cor"><ColorPicker colors={GOAL_COLORS} value={color} onChange={setColor} /></Field>
      <Button title="Salvar meta" icon="check" onPress={save} />
      {goal ? <Button title="Excluir" variant="danger" icon="trash-can-outline" onPress={remove} /> : null}
    </FormScroll>
  );
}
