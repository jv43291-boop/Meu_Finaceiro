import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { Modal, Pressable, View } from 'react-native';

import { currentInvoiceMonth, invoiceFor, usedLimit, type InvoiceStatus } from '@/domain/cards';
import { formatDateBR, monthLabel, parseDateBR, todayISO } from '@/domain/dates';
import { formatPlain, parseMoney } from '@/domain/money';
import { transactionToItem } from '@/domain/recurrence';
import { useFinance } from '@/state/finance';
import { CardBadge, LimitBar } from '@/ui/CardVisual';
import { Amount, Button, Card, Chip, Empty, Field, IconButton, Input, MonthSwitcher, Pill, Screen, T, tapFeedback } from '@/ui/components';
import { confirmAsk, notify } from '@/ui/dialogs';
import { ItemRow } from '@/ui/ItemRow';
import { openItem } from '@/ui/nav';
import { radius, space, useColors } from '@/ui/theme';

const STATUS: Record<InvoiceStatus, { label: string; tone: 'primary' | 'warning' }> = {
  open: { label: 'aberta', tone: 'primary' },
  closed: { label: 'fechada', tone: 'warning' },
  paid: { label: 'paga', tone: 'primary' },
  overdue: { label: 'atrasada', tone: 'warning' },
};

export default function CardDetail() {
  const { id, mes } = useLocalSearchParams<{ id: string; mes?: string }>();
  const f = useFinance();
  const card = f.cards.find((k) => k.id === id);
  const today = todayISO();
  const [month, setMonth] = useState<string | null>(mes ?? null);
  const [paying, setPaying] = useState(false);

  const data = useMemo(() => {
    if (!card) return null;
    const state = { cards: f.cards, transactions: f.transactions, recurrences: f.recurrences };
    const m = month ?? currentInvoiceMonth(card, today);
    return { m, invoice: invoiceFor(card, m, state, today), used: usedLimit(card, state, today) };
  }, [card, f.cards, f.transactions, f.recurrences, month, today]);

  if (!card || !data) {
    return (
      <Screen>
        <Empty icon="credit-card-off-outline" title="Cartão não encontrado" />
      </Screen>
    );
  }
  const { m, invoice, used } = data;
  const status = STATUS[invoice.status];
  const payAccount = invoice.payment?.accountId ? f.accountById.get(invoice.payment.accountId) : undefined;

  async function undoPayment() {
    if (!invoice.payment) return;
    if (!(await confirmAsk('Desfazer pagamento?', 'O valor volta para a conta e a fatura fica em aberto de novo.', 'Desfazer', true))) return;
    await f.toggle(transactionToItem(invoice.payment));
  }

  return (
    <Screen>
      <Stack.Screen
        options={{
          title: card.name,
          headerRight: () => <IconButton icon="pencil-outline" label="Editar cartão" onPress={() => router.push({ pathname: '/cartao/editar', params: { id: card.id } })} />,
        }}
      />
      <MonthSwitcher month={m} onChange={setMonth} />

      <View style={{ backgroundColor: card.color, borderRadius: radius.xl, padding: 20, gap: 12 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <CardBadge card={card} size={36} />
          <View style={{ paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999, backgroundColor: 'rgba(255,255,255,0.2)' }}>
            <T variant="caption" weight="bold" color="#FFFFFF">Fatura {status.label}</T>
          </View>
        </View>
        <T variant="caption" color="rgba(255,255,255,0.85)">Total da fatura de {monthLabel(m, false).toLowerCase()}</T>
        <Amount cents={invoice.totalCents} size="display" color="#FFFFFF" />
        <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
          <T variant="caption" color="rgba(255,255,255,0.85)">Fecha {formatDateBR(invoice.closingDate)}</T>
          <T variant="caption" color="rgba(255,255,255,0.85)">Vence {formatDateBR(invoice.dueDate)}</T>
        </View>
      </View>

      {invoice.payment ? (
        <Card>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <T variant="heading">Pagamento</T>
            <Pill tone={invoice.remainingCents > 0 ? 'warning' : 'primary'} label={invoice.remainingCents > 0 ? 'falta pagar' : 'quitada'} />
          </View>
          <T variant="caption">
            {`Pago em ${formatDateBR(invoice.payment.date)}${payAccount ? ` com ${payAccount.name}` : ''}.`}
          </T>
          <Amount cents={invoice.paidCents} size="heading" type="expense" />
          {invoice.remainingCents > 0 ? (
            <>
              <T variant="caption">Compras lançadas depois do pagamento somam mais:</T>
              <Amount cents={invoice.remainingCents} type="expense" />
              <Button title="Pagar o restante" icon="cash-check" onPress={() => setPaying(true)} />
            </>
          ) : null}
          <Button title="Desfazer pagamento" variant="ghost" icon="undo" onPress={undoPayment} />
        </Card>
      ) : invoice.totalCents > 0 ? (
        <Button title="Pagar fatura" icon="cash-check" onPress={() => setPaying(true)} />
      ) : null}

      {card.limitCents > 0 ? (
        <Card>
          <T variant="label">Limite</T>
          <LimitBar used={used} limit={card.limitCents} />
          <T variant="caption">Inclui as parcelas futuras que já estão lançadas.</T>
        </Card>
      ) : null}

      <Card style={{ gap: 4 }}>
        <T variant="heading" style={{ paddingBottom: 6 }}>Compras ({invoice.items.length})</T>
        {invoice.items.length === 0 ? (
          <T variant="caption">Nenhuma compra nesta fatura. Use o + e escolha este cartão em “Pagar com”.</T>
        ) : (
          invoice.items.map((it) => <ItemRow key={it.key} item={it} showDate onPress={() => openItem(it)} />)
        )}
      </Card>

      <PaySheet
        visible={paying}
        onClose={() => setPaying(false)}
        defaultAccountId={card.accountId ?? f.defaultAccountId}
        defaultAmount={invoice.totalCents}
        onPay={async (accountId, cents, date) => {
          await f.payCardInvoice(card, m, accountId, cents, date);
          tapFeedback('success');
          setPaying(false);
        }}
      />
    </Screen>
  );
}

function PaySheet({ visible, onClose, defaultAccountId, defaultAmount, onPay }: {
  visible: boolean;
  onClose: () => void;
  defaultAccountId: string | null;
  defaultAmount: number;
  onPay: (accountId: string | null, cents: number, date: string) => Promise<void>;
}) {
  const c = useColors();
  const f = useFinance();
  const accounts = f.accounts.filter((a) => !a.archived);
  const [accountId, setAccountId] = useState(defaultAccountId);
  const [amount, setAmount] = useState(formatPlain(defaultAmount));
  const [date, setDate] = useState(formatDateBR(todayISO()));
  const [busy, setBusy] = useState(false);

  async function confirm() {
    const cents = parseMoney(amount);
    const d = parseDateBR(date, Number(todayISO().slice(0, 4)));
    if (!cents || cents <= 0) return notify('Revise os dados', 'Informe o valor pago.');
    if (!d) return notify('Revise os dados', 'Informe a data no formato dd/mm/aaaa.');
    setBusy(true);
    try {
      await onPay(accountId, cents, d);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose} onShow={() => { setAmount(formatPlain(defaultAmount)); setAccountId(defaultAccountId); }}>
      <Pressable style={{ flex: 1, backgroundColor: c.overlay, justifyContent: 'flex-end' }} onPress={onClose}>
        <Pressable style={{ backgroundColor: c.surface, borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl, padding: space.xl, gap: space.lg, paddingBottom: space.xxl }}>
          <T variant="heading">Pagar fatura</T>
          <Field label="Valor pago (R$)" hint="Normalmente o total. Se pagou só uma parte, informe o que pagou.">
            <Input value={amount} onChangeText={setAmount} keyboardType="decimal-pad" />
          </Field>
          <Field label="Data do pagamento"><Input value={date} onChangeText={setDate} keyboardType="numbers-and-punctuation" /></Field>
          {accounts.length > 0 && (
            <Field label="Saiu da conta">
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm }}>
                {accounts.map((a) => <Chip key={a.id} label={a.name} icon="wallet-outline" color={a.color} selected={accountId === a.id} onPress={() => setAccountId(a.id)} />)}
              </View>
            </Field>
          )}
          <Button title="Confirmar pagamento" icon="check" onPress={confirm} disabled={busy} />
          <Button title="Cancelar" variant="secondary" onPress={onClose} />
        </Pressable>
      </Pressable>
    </Modal>
  );
}
