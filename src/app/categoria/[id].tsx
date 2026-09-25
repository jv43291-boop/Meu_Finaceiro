import { useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';

import { CATEGORY_ICONS, PALETTE } from '@/domain/defaults';
import type { EntryType } from '@/domain/types';
import { ctx, useFinance } from '@/state/finance';
import { Button, ColorPicker, Field, Icon, Input, Segmented, SwitchRow } from '@/ui/components';
import { notify } from '@/ui/dialogs';
import { radius, space, useColors } from '@/ui/theme';
import { goBack } from '@/ui/nav';

export default function CategoryForm() {
  const c = useColors();
  const params = useLocalSearchParams<{ id: string; type?: EntryType }>();
  const f = useFinance();
  const existing = f.categories.find((x) => x.id === params.id);
  const [name, setName] = useState(existing?.name ?? '');
  const [type, setType] = useState<EntryType>(existing?.type ?? params.type ?? 'expense');
  const [icon, setIcon] = useState(existing?.icon ?? 'tag-outline');
  const [color, setColor] = useState(existing?.color ?? PALETTE[5]);
  const [archived, setArchived] = useState(existing?.archived ?? false);

  async function save() {
    if (!name.trim()) return notify('Revise os dados', 'Informe o nome da categoria.');
    const now = ctx.now();
    await f.saveCategory({
      id: existing?.id ?? ctx.newId(), createdAt: existing?.createdAt ?? now, updatedAt: now, deletedAt: null,
      name: name.trim(), type, icon, color, archived, budgetCents: existing?.budgetCents ?? null,
    });
    goBack();
  }

  async function remove() {
    if (!existing) return;
    const used = f.transactions.some((t) => t.categoryId === existing.id && !t.deletedAt) || f.recurrences.some((r) => r.categoryId === existing.id);
    if (used) return notify('Categoria em uso', 'Ela tem lançamentos. Arquive em vez de excluir, para manter o histórico.');
    const now = ctx.now();
    await f.saveCategory({ ...existing, deletedAt: now, updatedAt: now });
    goBack();
  }

  return (
    <ScrollView contentContainerStyle={{ padding: space.lg, gap: space.lg }} keyboardShouldPersistTaps="handled">
      <Field label="Nome"><Input value={name} onChangeText={setName} autoFocus={!existing} /></Field>
      {!existing && (
        <Segmented value={type} onChange={setType} options={[{ value: 'expense', label: 'Despesa', color: c.expense }, { value: 'income', label: 'Receita', color: c.income }]} />
      )}
      <Field label="Ícone">
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm }}>
          {CATEGORY_ICONS.map((i) => (
            <Pressable key={i} accessibilityLabel={i} onPress={() => setIcon(i)}
              style={{ width: 48, height: 48, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: icon === i ? color : c.border, backgroundColor: icon === i ? color + '22' : c.surface }}>
              <Icon name={i} color={icon === i ? color : c.muted} />
            </Pressable>
          ))}
        </View>
      </Field>
      <Field label="Cor">
        <ColorPicker colors={PALETTE} value={color} onChange={setColor} />
      </Field>
      {existing && <SwitchRow title="Arquivada" subtitle="Some das escolhas ao lançar, mas continua no histórico." value={archived} onChange={setArchived} />}
      <Button title="Salvar" icon="check" onPress={save} />
      {existing && <Button title="Excluir" variant="danger" icon="trash-can-outline" onPress={remove} />}
    </ScrollView>
  );
}
