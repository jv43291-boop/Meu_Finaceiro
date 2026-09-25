import { useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { ScrollView, View } from 'react-native';

import { PALETTE } from '@/domain/defaults';
import { formatPlain, parseMoney } from '@/domain/money';
import type { Account } from '@/domain/types';
import { ctx, useFinance } from '@/state/finance';
import { Button, Chip, Field, Input, Segmented, SwitchRow } from '@/ui/components';
import { notify } from '@/ui/dialogs';
import { space } from '@/ui/theme';
import { goBack } from '@/ui/nav';

export default function AccountForm() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const f = useFinance();
  const existing = f.accounts.find((a) => a.id === id);
  const [name, setName] = useState(existing?.name ?? '');
  const [kind, setKind] = useState<Account['kind']>(existing?.kind ?? 'checking');
  const [opening, setOpening] = useState(formatPlain(existing?.openingBalanceCents ?? 0));
  const [color, setColor] = useState(existing?.color ?? PALETTE[4]);
  const [archived, setArchived] = useState(existing?.archived ?? false);

  async function save() {
    const cents = parseMoney(opening);
    if (!name.trim()) return notify('Revise os dados', 'Informe o nome da conta.');
    if (cents === null) return notify('Revise os dados', 'Informe um saldo inicial válido (pode ser 0 ou negativo).');
    const now = ctx.now();
    await f.saveAccount({
      id: existing?.id ?? ctx.newId(), createdAt: existing?.createdAt ?? now, updatedAt: now, deletedAt: null,
      name: name.trim(), kind, openingBalanceCents: cents, color, archived,
    });
    goBack();
  }

  async function remove() {
    if (!existing) return;
    const used = f.transactions.some((t) => t.accountId === existing.id && !t.deletedAt);
    if (used) return notify('Conta em uso', 'Ela tem lançamentos. Arquive a conta em vez de excluir, para manter o histórico.');
    if (f.accounts.filter((a) => !a.deletedAt).length <= 1) return notify('Não é possível', 'Você precisa ter pelo menos uma conta.');
    const now = ctx.now();
    await f.saveAccount({ ...existing, deletedAt: now, updatedAt: now });
    goBack();
  }

  return (
    <ScrollView contentContainerStyle={{ padding: space.lg, gap: space.lg }} keyboardShouldPersistTaps="handled">
      <Field label="Nome"><Input value={name} onChangeText={setName} placeholder="Ex.: Nubank" autoFocus={!existing} /></Field>
      <Field label="Tipo">
        <Segmented value={kind} onChange={setKind} options={[
          { value: 'checking', label: 'Corrente' }, { value: 'savings', label: 'Poupança' }, { value: 'cash', label: 'Dinheiro' },
        ]} />
      </Field>
      <Field label="Saldo inicial (R$)" hint="Quanto havia na conta antes do primeiro lançamento registrado aqui.">
        <Input value={opening} onChangeText={setOpening} keyboardType="numbers-and-punctuation" />
      </Field>
      <Field label="Cor">
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm }}>
          {PALETTE.map((p) => <Chip key={p} label="  " color={p} icon="circle" selected={color === p} onPress={() => setColor(p)} />)}
        </View>
      </Field>
      {existing && <SwitchRow title="Arquivada" subtitle="Some das escolhas, mas mantém o histórico e o saldo." value={archived} onChange={setArchived} />}
      <Button title="Salvar" icon="check" onPress={save} />
      {existing && <Button title="Excluir" variant="danger" icon="trash-can-outline" onPress={remove} />}
    </ScrollView>
  );
}
