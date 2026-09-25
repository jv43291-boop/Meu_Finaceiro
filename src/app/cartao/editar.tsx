import { useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { ScrollView, View } from 'react-native';

import { closingDateOf, dueDateOf, invoiceMonthFor } from '@/domain/cards';
import { formatDateBR, shortMonthLabel, todayISO } from '@/domain/dates';
import { formatPlain, parseMoney } from '@/domain/money';
import { ctx, useFinance } from '@/state/finance';
import { Button, Chip, ColorPicker, Field, Input, SwitchRow, T } from '@/ui/components';
import { confirmAsk, notify } from '@/ui/dialogs';
import { goBack } from '@/ui/nav';
import { space } from '@/ui/theme';

const CARD_COLORS = ['#5B45FF', '#8E6CE8', '#2563EB', '#0B8457', '#BE185D', '#C2410C', '#0E1116', '#6D7F8C'];

export default function CardForm() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const f = useFinance();
  const existing = id ? f.cards.find((k) => k.id === id) : undefined;
  const accounts = f.accounts.filter((a) => !a.archived);
  const [name, setName] = useState(existing?.name ?? '');
  const [limit, setLimit] = useState(existing ? formatPlain(existing.limitCents) : '');
  const [closing, setClosing] = useState(existing ? String(existing.closingDay) : '');
  const [due, setDue] = useState(existing ? String(existing.dueDay) : '');
  const [accountId, setAccountId] = useState<string | null>(existing?.accountId ?? f.defaultAccountId);
  const [color, setColor] = useState(existing?.color ?? CARD_COLORS[0]);
  const [archived, setArchived] = useState(existing?.archived ?? false);

  const closingDay = Number(closing);
  const dueDay = Number(due);
  const validDays = Number.isInteger(closingDay) && closingDay >= 1 && closingDay <= 31 && Number.isInteger(dueDay) && dueDay >= 1 && dueDay <= 31;
  const example = validDays
    ? (() => {
        const k = { closingDay, dueDay };
        const m = invoiceMonthFor(k, todayISO());
        return `Uma compra hoje entra na fatura de ${shortMonthLabel(m)}, que fecha em ${formatDateBR(closingDateOf(k, m))} e vence em ${formatDateBR(dueDateOf(k, m))}.`;
      })()
    : null;

  async function save() {
    const cents = limit.trim() ? parseMoney(limit) : 0;
    if (!name.trim()) return notify('Revise os dados', 'Informe o nome do cartão.');
    if (cents === null || cents < 0) return notify('Revise os dados', 'Informe um limite válido (ou deixe em branco).');
    if (!validDays) return notify('Revise os dados', 'Os dias de fechamento e de vencimento precisam estar entre 1 e 31.');
    if (closingDay === dueDay) return notify('Revise os dados', 'O fechamento e o vencimento não podem ser no mesmo dia.');
    const now = ctx.now();
    await f.saveCard({
      id: existing?.id ?? ctx.newId(), createdAt: existing?.createdAt ?? now, updatedAt: now, deletedAt: null,
      name: name.trim(), limitCents: cents, closingDay, dueDay, accountId, color, archived,
    });
    goBack();
  }

  async function remove() {
    if (!existing) return;
    const used = f.transactions.some((t) => t.cardId === existing.id && !t.deletedAt) || f.recurrences.some((r) => r.cardId === existing.id);
    if (used) return notify('Cartão em uso', 'Ele tem compras ou faturas. Arquive o cartão em vez de excluir, para manter o histórico.');
    if (!(await confirmAsk('Excluir cartão?', existing.name, 'Excluir', true))) return;
    const now = ctx.now();
    await f.saveCard({ ...existing, deletedAt: now, updatedAt: now });
    goBack();
  }

  return (
    <ScrollView contentContainerStyle={{ padding: space.xl, gap: space.xl }} keyboardShouldPersistTaps="handled">
      <Field label="Nome"><Input value={name} onChangeText={setName} placeholder="Ex.: Nubank" autoFocus={!existing} /></Field>
      <Field label="Limite (R$)" hint="Opcional. Serve para mostrar quanto ainda está disponível.">
        <Input value={limit} onChangeText={setLimit} placeholder="0,00" keyboardType="decimal-pad" />
      </Field>
      <View style={{ flexDirection: 'row', gap: space.md }}>
        <View style={{ flex: 1 }}><Field label="Dia do fechamento"><Input value={closing} onChangeText={setClosing} keyboardType="number-pad" maxLength={2} placeholder="Ex.: 3" /></Field></View>
        <View style={{ flex: 1 }}><Field label="Dia do vencimento"><Input value={due} onChangeText={setDue} keyboardType="number-pad" maxLength={2} placeholder="Ex.: 10" /></Field></View>
      </View>
      {example ? <T variant="caption">{example}</T> : <T variant="caption">Compras feitas no dia do fechamento ou depois entram na fatura seguinte.</T>}
      {accounts.length > 0 && (
        <Field label="Pagar a fatura com" hint="Conta sugerida na hora de pagar. Dá para trocar em cada pagamento.">
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm }}>
            {accounts.map((a) => <Chip key={a.id} label={a.name} icon="wallet-outline" color={a.color} selected={accountId === a.id} onPress={() => setAccountId(a.id)} />)}
          </View>
        </Field>
      )}
      <Field label="Cor">
        <ColorPicker colors={CARD_COLORS} value={color} onChange={setColor} />
      </Field>
      {existing && <SwitchRow title="Arquivado" subtitle="Some das escolhas, mas mantém o histórico." value={archived} onChange={setArchived} />}
      <Button title="Salvar" icon="check" onPress={save} />
      {existing && <Button title="Excluir" variant="danger" icon="trash-can-outline" onPress={remove} />}
    </ScrollView>
  );
}
