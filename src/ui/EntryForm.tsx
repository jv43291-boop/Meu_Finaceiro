import { useMemo, useState } from 'react';
import { KeyboardAvoidingView, Platform, TextInput, View } from 'react-native';

import { dueDateOf, invoiceMonthFor } from '@/domain/cards';
import { addDays, formatDateBR, monthLabel, parseDateBR, shiftMonth, todayISO, type DateISO } from '@/domain/dates';
import { formatPlain, parseMoney } from '@/domain/money';
import { validateEntry, type EntryInput, type Repeat } from '@/domain/operations';
import type { Scope } from '@/domain/recurrence';
import type { EntryType, ListItem } from '@/domain/types';
import { useFinance } from '@/state/finance';
import { FormScroll, Button, Chip, Field, IconButton, Input, ScopeSheet, Segmented, SwitchRow, T } from './components';
import { confirmAsk, notify } from './dialogs';
import { fonts, space, useColors } from './theme';

type RepeatKind = Repeat['kind'];

export interface EntryFormProps {
  item?: ListItem;
  defaultDate?: DateISO;
  onDone: () => void;
}

export function EntryForm({ item, defaultDate, onDone }: EntryFormProps) {
  const c = useColors();
  const f = useFinance();
  const editing = Boolean(item);

  const [type, setType] = useState<EntryType>(item?.type ?? 'expense');
  const [amount, setAmount] = useState(item ? formatPlain(item.amountCents) : '');
  const [description, setDescription] = useState(item?.description ?? '');
  const [categoryId, setCategoryId] = useState<string | null>(item?.categoryId ?? null);
  const [accountId, setAccountId] = useState<string | null>(item?.accountId ?? f.defaultAccountId);
  const [date, setDate] = useState<DateISO>(item?.date ?? defaultDate ?? todayISO());
  const [dateText, setDateText] = useState(formatDateBR(item?.date ?? defaultDate ?? todayISO()));
  const [paid, setPaid] = useState(item?.paid ?? false);
  const [cardId, setCardId] = useState<string | null>(item?.cardId && !item.invoicePayment ? item.cardId : null);
  // quantos meses a pessoa empurrou a fatura em relação à calculada pela data
  const [invoiceShift, setInvoiceShift] = useState(0);
  const [notes, setNotes] = useState(item?.notes ?? '');
  const [repeat, setRepeat] = useState<RepeatKind>('none');
  const [months, setMonths] = useState('');
  const [installments, setInstallments] = useState('2');
  const [sheet, setSheet] = useState<null | 'save' | 'delete'>(null);
  const [busy, setBusy] = useState(false);

  const categories = f.categories.filter((cat) => cat.type === type && !cat.archived);
  const accounts = f.accounts.filter((a) => !a.archived);
  const cards = f.cards.filter((k) => !k.archived || k.id === cardId);
  const card = cardId ? f.cardById.get(cardId) : undefined;
  const onCard = type === 'expense' && !!card;
  // fatura: a que já estava gravada (edição) ou a calculada pela data, mais o ajuste manual
  const baseInvoice = card ? (editing && item?.invoiceMonth && item.cardId === card.id && item.date === date ? item.invoiceMonth : invoiceMonthFor(card, date)) : null;
  const invoiceMonth = baseInvoice ? shiftMonth(baseInvoice, invoiceShift) : null;

  // sugestões a partir de lançamentos anteriores
  const suggestions = useMemo(() => {
    const q = description.trim().toLowerCase();
    if (editing || q.length < 2) return [];
    const seen = new Map<string, { description: string; categoryId: string | null; amountCents: number }>();
    const pool = [...f.recurrences, ...f.transactions.filter((t) => !t.deletedAt)].filter((x) => x.type === type);
    for (let i = pool.length - 1; i >= 0; i--) {
      const x = pool[i];
      const key = x.description.toLowerCase();
      if (key.includes(q) && key !== q && !seen.has(key)) seen.set(key, { description: x.description, categoryId: x.categoryId, amountCents: x.amountCents });
      if (seen.size >= 4) break;
    }
    return [...seen.values()];
  }, [description, editing, f.recurrences, f.transactions, type]);

  const kind: 'recurrence' | 'installments' | null = item?.recurrenceId ? 'recurrence' : item?.installmentTotal ? 'installments' : null;

  function onDateText(text: string) {
    setDateText(text);
    const parsed = parseDateBR(text, Number(date.slice(0, 4)));
    if (parsed) setDate(parsed);
  }
  function pickDate(d: DateISO) {
    setDate(d);
    setDateText(formatDateBR(d));
  }

  function buildInput(): EntryInput | null {
    const cents = parseMoney(amount);
    const parsedDate = parseDateBR(dateText, Number(date.slice(0, 4)));
    const input: EntryInput = {
      type, description, amountCents: cents ?? 0, date: parsedDate ?? '', paid: onCard ? false : paid, categoryId,
      accountId: onCard ? null : accountId, notes,
      cardId: onCard ? cardId : null,
      invoiceMonth: onCard ? invoiceMonth : null,
    };
    const err = cents === null ? 'Informe um valor válido, por exemplo 1.621,50.' : !parsedDate ? 'Informe a data no formato dd/mm/aaaa.' : validateEntry(input);
    if (err) {
      notify('Revise os dados', err);
      return null;
    }
    return input;
  }

  async function run(fn: () => Promise<void>) {
    setBusy(true);
    try {
      await fn();
      onDone();
    } catch (e) {
      notify('Não foi possível salvar', e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  function onSave() {
    const input = buildInput();
    if (!input) return;
    if (!item) {
      let rep: Repeat = { kind: 'none' };
      if (repeat === 'monthly') {
        const n = months.trim() ? Number(months) : null;
        if (n !== null && (!Number.isInteger(n) || n < 1)) return notify('Revise os dados', 'Informe um número de meses válido ou deixe em branco.');
        rep = { kind: 'monthly', months: n };
      } else if (repeat === 'installments') {
        const n = Number(installments);
        if (!Number.isInteger(n) || n < 2 || n > 120) return notify('Revise os dados', 'O parcelamento precisa ter de 2 a 120 parcelas.');
        rep = { kind: 'installments', total: n };
      }
      return run(() => f.create(input, rep));
    }
    if (kind) return setSheet('save');
    return run(() => f.edit(item, input, 'this'));
  }

  function onDelete() {
    if (!item) return;
    if (kind) return setSheet('delete');
    confirmAsk('Excluir lançamento?', item.description, 'Excluir', true).then((ok) => {
      if (ok) run(() => f.remove(item, 'this'));
    });
  }

  function onScope(scope: Scope) {
    const action = sheet;
    setSheet(null);
    if (!item) return;
    if (action === 'delete') return run(() => f.remove(item, scope));
    const input = buildInput();
    if (input) run(() => f.edit(item, input, scope));
  }

  const typeColor = type === 'income' ? c.income : c.expense;

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <FormScroll contentContainerStyle={{ padding: space.xl, gap: space.xl, paddingBottom: 60 }} keyboardShouldPersistTaps="handled">
        <Segmented
          value={type}
          onChange={(t) => { setType(t); setCategoryId(null); }}
          options={[{ value: 'expense', label: 'Despesa', color: c.expense }, { value: 'income', label: 'Receita', color: c.income }]}
        />

        <View style={{ alignItems: 'center', gap: 4, paddingVertical: space.sm }}>
          <T variant="caption">Valor</T>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <T variant="title" color={c.muted}>R$</T>
            <TextInput
              accessibilityLabel="Valor em reais"
              value={amount}
              onChangeText={setAmount}
              placeholder="0,00"
              placeholderTextColor={c.muted}
              keyboardType="decimal-pad"
              autoFocus={!editing}
              selectionColor={c.primary}
              style={[{ minWidth: 140, fontSize: 46, fontFamily: fonts.extrabold, letterSpacing: -1, color: typeColor, textAlign: 'center', paddingVertical: 4 }, Platform.OS === 'web' && ({ outlineStyle: 'none' } as object)]}
            />
          </View>
        </View>

        <Field label="Descrição">
          <Input value={description} onChangeText={setDescription} placeholder={type === 'income' ? 'Ex.: Salário' : 'Ex.: Aluguel'} />
          {suggestions.length > 0 && (
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm }}>
              {suggestions.map((s) => (
                <Chip key={s.description} label={s.description} selected={false} icon="history"
                  onPress={() => { setDescription(s.description); if (s.categoryId) setCategoryId(s.categoryId); if (!amount) setAmount(formatPlain(s.amountCents)); }} />
              ))}
            </View>
          )}
        </Field>

        <Field label="Categoria">
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm }}>
            {categories.map((cat) => (
              <Chip key={cat.id} label={cat.name} icon={cat.icon} color={cat.color} selected={categoryId === cat.id} onPress={() => setCategoryId(categoryId === cat.id ? null : cat.id)} />
            ))}
          </View>
        </Field>

        {(accounts.length > 1 || (type === 'expense' && cards.length > 0)) && (
          <Field label={type === 'expense' ? 'Pagar com' : 'Conta'}>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm }}>
              {accounts.map((a) => (
                <Chip key={a.id} label={a.name} icon="wallet-outline" color={a.color} selected={!onCard && accountId === a.id} onPress={() => { setAccountId(a.id); setCardId(null); }} />
              ))}
              {type === 'expense' &&
                cards.map((k) => (
                  <Chip key={k.id} label={k.name} icon="credit-card-outline" color={k.color} selected={cardId === k.id} onPress={() => { setCardId(k.id); setInvoiceShift(0); }} />
                ))}
            </View>
          </Field>
        )}

        <Field label={repeat === 'none' || editing ? 'Data' : 'Primeira data'}>
          <Input value={dateText} onChangeText={onDateText} placeholder="dd/mm/aaaa" keyboardType="numbers-and-punctuation" />
          <View style={{ flexDirection: 'row', gap: space.sm }}>
            <Chip label="Hoje" selected={date === todayISO()} onPress={() => pickDate(todayISO())} />
            <Chip label="Ontem" selected={date === addDays(todayISO(), -1)} onPress={() => pickDate(addDays(todayISO(), -1))} />
          </View>
        </Field>

        {onCard && invoiceMonth ? (
          <Field label="Fatura" hint={repeat === 'installments' && !editing ? 'A primeira parcela entra nesta fatura; as outras, nas seguintes.' : 'Calculada pela data e pelo fechamento do cartão. Ajuste se o banco lançou em outra.'}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
              <IconButton icon="chevron-left" label="Fatura anterior" onPress={() => setInvoiceShift((n) => n - 1)} />
              <View style={{ flex: 1, alignItems: 'center' }}>
                <T variant="bodyStrong">{monthLabel(invoiceMonth)}</T>
                <T variant="caption">vence {formatDateBR(dueDateOf(card!, invoiceMonth))}</T>
              </View>
              <IconButton icon="chevron-right" label="Próxima fatura" onPress={() => setInvoiceShift((n) => n + 1)} />
            </View>
          </Field>
        ) : (
          <SwitchRow
            title={type === 'income' ? 'Já recebi' : 'Já paguei'}
            subtitle={type === 'income' ? 'Soma no saldo da conta.' : 'Desconta do saldo da conta.'}
            value={paid}
            onChange={setPaid}
          />
        )}

        {!editing && (
          <Field label="Repetição">
            <Segmented
              value={repeat}
              onChange={setRepeat}
              options={[{ value: 'none', label: 'Uma vez' }, { value: 'monthly', label: 'Todo mês' }, { value: 'installments', label: 'Parcelado' }]}
            />
            {repeat === 'monthly' && (
              <Field label="Por quantos meses?" hint="Deixe em branco para repetir sem data de fim (salário, aluguel, assinaturas).">
                <Input value={months} onChangeText={setMonths} placeholder="Sem fim" keyboardType="number-pad" maxLength={3} />
              </Field>
            )}
            {repeat === 'installments' && (
              <Field label="Número de parcelas" hint="O valor informado é o de cada parcela.">
                <Input value={installments} onChangeText={setInstallments} keyboardType="number-pad" maxLength={3} />
              </Field>
            )}
          </Field>
        )}

        {editing && kind === 'recurrence' && (
          <T variant="caption">Este lançamento faz parte de uma recorrência mensal. Ao salvar, você escolhe se a mudança vale só para este mês ou para os próximos.</T>
        )}

        <Field label="Observações">
          <Input value={notes} onChangeText={setNotes} placeholder="Opcional" multiline style={{ minHeight: 72, textAlignVertical: 'top' }} />
        </Field>

        <Button title={editing ? 'Salvar alterações' : 'Salvar lançamento'} onPress={onSave} disabled={busy} icon="check" />
        {editing && <Button title="Excluir" variant="danger" onPress={onDelete} disabled={busy} icon="trash-can-outline" />}
      </FormScroll>

      <ScopeSheet
        visible={sheet !== null}
        kind={kind ?? 'recurrence'}
        title={sheet === 'delete' ? 'Excluir quais?' : 'Aplicar a mudança em quais?'}
        onPick={onScope}
        onClose={() => setSheet(null)}
      />
    </KeyboardAvoidingView>
  );
}
