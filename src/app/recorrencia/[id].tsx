import { useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Alert, ScrollView, View } from 'react-native';

import { currentMonthKey, monthDiff, monthLabel, shiftMonth, type MonthKey } from '@/domain/dates';
import { formatPlain, parseMoney } from '@/domain/money';
import type { Recurrence } from '@/domain/types';
import { useFinance } from '@/state/finance';
import { Button, Chip, Empty, Field, Input, Screen, T } from '@/ui/components';
import { confirmAsk, notify } from '@/ui/dialogs';
import { space } from '@/ui/theme';
import { goBack } from '@/ui/nav';

const MONTH_RE = /^(\d{1,2})\/(\d{4})$/;
const toMonthText = (m: MonthKey | null) => (m ? `${m.slice(5, 7)}/${m.slice(0, 4)}` : '');
function parseMonthText(s: string): MonthKey | null | 'invalid' {
  if (!s.trim()) return null;
  const m = s.trim().match(MONTH_RE);
  if (!m || Number(m[1]) < 1 || Number(m[1]) > 12) return 'invalid';
  return `${m[2]}-${m[1].padStart(2, '0')}`;
}

export default function RecurrenceScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const f = useFinance();
  const rule = f.recurrences.find((r) => r.id === id);
  if (!rule) {
    return (
      <Screen>
        <Empty icon="calendar-remove-outline" title="Recorrência não encontrada" />
      </Screen>
    );
  }
  return <RuleForm rule={rule} />;
}

function RuleForm({ rule }: { rule: Recurrence }) {
  const f = useFinance();
  const [description, setDescription] = useState(rule.description);
  const [amount, setAmount] = useState(formatPlain(rule.amountCents));
  const [day, setDay] = useState(String(rule.day));
  const [categoryId, setCategoryId] = useState(rule.categoryId);
  const [accountId, setAccountId] = useState(rule.accountId);
  const [start, setStart] = useState(toMonthText(rule.startMonth));
  const [end, setEnd] = useState(toMonthText(rule.endMonth));
  const month = currentMonthKey();
  const paidCount = f.transactions.filter((t) => t.recurrenceId === rule.id && t.paid && !t.deletedAt).length;

  function save() {
    const cents = parseMoney(amount);
    const d = Number(day);
    const s = parseMonthText(start);
    const e = parseMonthText(end);
    if (!description.trim()) return notify('Revise os dados', 'Informe uma descrição.');
    if (!cents || cents <= 0) return notify('Revise os dados', 'Informe um valor válido.');
    if (!Number.isInteger(d) || d < 1 || d > 31) return notify('Revise os dados', 'O dia precisa estar entre 1 e 31.');
    if (s === 'invalid' || s === null) return notify('Revise os dados', 'Informe o mês de início no formato mm/aaaa.');
    if (e === 'invalid') return notify('Revise os dados', 'Informe o mês final no formato mm/aaaa, ou deixe em branco.');
    if (e && monthDiff(s, e) < 0) return notify('Revise os dados', 'O mês final precisa ser depois do início.');
    f.saveRule({ ...rule, description: description.trim(), amountCents: cents, day: d, categoryId, accountId, startMonth: s, endMonth: e })
      .then(() => goBack());
  }

  function endNow() {
    const last = shiftMonth(month, -1);
    Alert.alert(
      'Encerrar recorrência?',
      `Ela deixa de aparecer a partir de ${monthLabel(month).toLowerCase()}. O histórico continua.`,
      [
        { text: 'Cancelar', style: 'cancel' },
        { text: `Manter até ${monthLabel(month).toLowerCase()}`, onPress: () => f.endRule(rule, month).then(() => goBack()) },
        { text: 'Encerrar', style: 'destructive', onPress: () => f.endRule(rule, last).then(() => goBack()) },
      ],
    );
  }

  function remove() {
    confirmAsk(
      'Excluir recorrência?',
      paidCount
        ? `Os ${paidCount} lançamento(s) já pagos continuam no histórico. Os pendentes e os meses futuros somem.`
        : 'Todos os meses desta recorrência deixam de aparecer.',
      'Excluir',
      true,
    ).then(async (ok) => {
      if (ok) {
        await f.deleteRule(rule);
        goBack();
      }
    });
  }

  const categories = f.categories.filter((c) => c.type === rule.type && !c.archived);
  const accounts = f.accounts.filter((a) => !a.archived);

  return (
    <ScrollView contentContainerStyle={{ padding: space.lg, gap: space.lg, paddingBottom: 60 }} keyboardShouldPersistTaps="handled">
      <T variant="caption">
        Mudanças aqui valem para todos os meses. Lançamentos já gravados (pagos ou editados individualmente) não mudam.
      </T>
      <Field label="Descrição"><Input value={description} onChangeText={setDescription} /></Field>
      <View style={{ flexDirection: 'row', gap: space.md }}>
        <View style={{ flex: 2 }}><Field label="Valor (R$)"><Input value={amount} onChangeText={setAmount} keyboardType="decimal-pad" /></Field></View>
        <View style={{ flex: 1 }}><Field label="Dia"><Input value={day} onChangeText={setDay} keyboardType="number-pad" maxLength={2} /></Field></View>
      </View>
      <View style={{ flexDirection: 'row', gap: space.md }}>
        <View style={{ flex: 1 }}><Field label="Início (mm/aaaa)"><Input value={start} onChangeText={setStart} keyboardType="numbers-and-punctuation" /></Field></View>
        <View style={{ flex: 1 }}><Field label="Fim (mm/aaaa)"><Input value={end} onChangeText={setEnd} placeholder="Sem fim" keyboardType="numbers-and-punctuation" /></Field></View>
      </View>
      <Field label="Categoria">
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm }}>
          {categories.map((c) => (
            <Chip key={c.id} label={c.name} icon={c.icon} color={c.color} selected={categoryId === c.id} onPress={() => setCategoryId(c.id)} />
          ))}
        </View>
      </Field>
      {accounts.length > 1 && (
        <Field label="Conta">
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm }}>
            {accounts.map((a) => (
              <Chip key={a.id} label={a.name} color={a.color} selected={accountId === a.id} onPress={() => setAccountId(a.id)} />
            ))}
          </View>
        </Field>
      )}
      <Button title="Salvar" icon="check" onPress={save} />
      <Button title="Encerrar" variant="secondary" icon="calendar-end" onPress={endNow} />
      <Button title="Excluir" variant="danger" icon="trash-can-outline" onPress={remove} />
    </ScrollView>
  );
}
