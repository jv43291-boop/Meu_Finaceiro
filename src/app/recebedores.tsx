import { useState } from 'react';
import { View } from 'react-native';

import type { PayeeRule } from '@/domain/types';
import { ctx, useFinance } from '@/state/finance';
import { Button, Card, Chip, Empty, Field, Input, ListRow, Screen, T } from '@/ui/components';
import { confirmAsk, notify } from '@/ui/dialogs';
import { space } from '@/ui/theme';

/** Lista e edita as regras "Pix para FULANO = descrição". */
export default function PayeeRulesScreen() {
  const f = useFinance();
  const [editing, setEditing] = useState<PayeeRule | null>(null);
  const [description, setDescription] = useState('');
  const [categoryId, setCategoryId] = useState<string | null>(null);

  function open(r: PayeeRule) {
    setEditing(r);
    setDescription(r.description);
    setCategoryId(r.categoryId);
  }

  async function save() {
    if (!editing) return;
    if (!description.trim()) return notify('Falta a descrição');
    await f.savePayeeRule({ ...editing, description: description.trim(), categoryId, updatedAt: ctx.now() });
    setEditing(null);
  }

  async function remove(r: PayeeRule) {
    if (!(await confirmAsk('Apagar regra?', `Os próximos Pix para "${r.matchName}" voltam a vir com o nome da pessoa.`, 'Apagar', true))) return;
    const now = ctx.now();
    await f.savePayeeRule({ ...r, deletedAt: now, updatedAt: now });
    setEditing(null);
  }

  if (editing) {
    const categories = f.categories.filter((c) => c.type === 'expense' && !c.archived);
    return (
      <Screen>
        <Card>
          <T variant="caption">Pix para</T>
          <T variant="heading">{editing.matchName}</T>
          {editing.matchDoc ? <T variant="caption">Documento com os dígitos {editing.matchDoc}</T> : <T variant="caption">Vale para qualquer documento com esse nome</T>}
        </Card>
        <Field label="Vira a descrição">
          <Input value={description} onChangeText={setDescription} placeholder="Ex.: Compra de pão" />
        </Field>
        <Field label="Categoria">
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm }}>
            {categories.map((c) => (
              <Chip key={c.id} label={c.name} icon={c.icon} color={c.color} selected={categoryId === c.id} onPress={() => setCategoryId(categoryId === c.id ? null : c.id)} />
            ))}
          </View>
        </Field>
        <Button title="Salvar regra" icon="check" onPress={save} />
        <Button title="Apagar regra" icon="trash-can-outline" variant="danger" onPress={() => remove(editing)} />
        <Button title="Voltar" variant="ghost" onPress={() => setEditing(null)} />
      </Screen>
    );
  }

  return (
    <Screen>
      {f.payeeRules.length === 0 ? (
        <Card>
          <Empty icon="account-switch-outline" title="Nenhuma regra ainda" text="Ao lançar um comprovante de Pix, ligue “Lembrar para…” e o Live passa a trocar o nome da pessoa pela descrição que você escolheu." />
        </Card>
      ) : (
        <Card>
          {f.payeeRules.map((r) => (
            <ListRow
              key={r.id}
              icon="account-arrow-right-outline"
              title={r.description}
              subtitle={`Pix para ${r.matchName}${r.categoryId ? ` · ${f.categoryById.get(r.categoryId)?.name ?? ''}` : ''}`}
              onPress={() => open(r)}
            />
          ))}
        </Card>
      )}
    </Screen>
  );
}
