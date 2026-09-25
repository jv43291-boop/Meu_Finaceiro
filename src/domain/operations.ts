/**
 * Regras de criação, edição e exclusão de lançamentos.
 * Funções puras: recebem o estado atual e devolvem os registros a gravar.
 * A camada de banco só aplica o resultado (upsert).
 */
import { dateForDay, dayOf, monthDiff, monthOf, shiftMonth, type DateISO, type MonthKey } from './dates';
import { occurrenceId, stableId } from './ids';
import type { Scope } from './recurrence';
import type { EntryType, ListItem, Recurrence, Transaction } from './types';

export interface Ctx {
  newId: () => string;
  now: () => string;
}

export interface Changes {
  transactions: Transaction[];
  recurrences: Recurrence[];
}

const empty = (): Changes => ({ transactions: [], recurrences: [] });

export type Repeat =
  | { kind: 'none' }
  | { kind: 'monthly'; months: number | null }
  | { kind: 'installments'; total: number };

export interface EntryInput {
  type: EntryType;
  description: string;
  amountCents: number;
  date: DateISO;
  paid: boolean;
  categoryId: string | null;
  accountId: string | null;
  notes: string;
  /** compra no cartão: a conta não é usada, e sim o cartão e a fatura */
  cardId?: string | null;
  /** mês de vencimento da fatura (obrigatório quando há cardId) */
  invoiceMonth?: MonthKey | null;
}

export type EntryPatch = Partial<EntryInput>;

function baseTx(ctx: Ctx, input: EntryInput): Transaction {
  const now = ctx.now();
  const onCard = !!input.cardId;
  return {
    id: ctx.newId(),
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
    type: input.type,
    description: input.description.trim(),
    amountCents: input.amountCents,
    date: input.date,
    paid: onCard ? false : input.paid,
    categoryId: input.categoryId,
    accountId: onCard ? null : input.accountId,
    notes: input.notes.trim(),
    recurrenceId: null,
    occurrenceMonth: null,
    groupId: null,
    installmentNumber: null,
    installmentTotal: null,
    cardId: input.cardId ?? null,
    invoiceMonth: onCard ? (input.invoiceMonth ?? null) : null,
    invoicePayment: false,
  };
}

export function validateEntry(input: EntryInput): string | null {
  if (!input.description.trim()) return 'Informe uma descrição.';
  if (!Number.isFinite(input.amountCents) || input.amountCents <= 0) return 'Informe um valor maior que zero.';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.date)) return 'Informe uma data válida.';
  return null;
}

export function createEntry(ctx: Ctx, input: EntryInput, repeat: Repeat): Changes {
  const out = empty();
  if (repeat.kind === 'none') {
    out.transactions.push(baseTx(ctx, input));
    return out;
  }

  if (repeat.kind === 'installments') {
    const total = Math.max(2, Math.floor(repeat.total));
    const groupId = ctx.newId();
    const start = monthOf(input.date);
    const day = dayOf(input.date);
    for (let i = 0; i < total; i++) {
      const tx = baseTx(ctx, input);
      tx.groupId = groupId;
      tx.installmentNumber = i + 1;
      tx.installmentTotal = total;
      if (tx.cardId) {
        // no cartão a data da compra é a mesma; cada parcela cai numa fatura seguinte
        tx.invoiceMonth = tx.invoiceMonth ? shiftMonth(tx.invoiceMonth, i) : null;
      } else {
        tx.date = dateForDay(shiftMonth(start, i), day);
        tx.paid = i === 0 ? input.paid : false;
      }
      out.transactions.push(tx);
    }
    return out;
  }

  // mensal: cria a regra; só grava a primeira ocorrência se ela já foi paga
  const now = ctx.now();
  const start = monthOf(input.date);
  const months = repeat.months && repeat.months > 0 ? Math.floor(repeat.months) : null;
  const rule: Recurrence = {
    id: ctx.newId(),
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
    type: input.type,
    description: input.description.trim(),
    amountCents: input.amountCents,
    categoryId: input.categoryId,
    accountId: input.cardId ? null : input.accountId,
    day: dayOf(input.date),
    startMonth: start,
    endMonth: months ? shiftMonth(start, months - 1) : null,
    notes: input.notes.trim(),
    cardId: input.cardId ?? null,
  };
  out.recurrences.push(rule);
  if (input.paid && !rule.cardId) out.transactions.push(materialize(ctx, rule, start, { paid: true, date: input.date }));
  return out;
}

/** Grava uma ocorrência da regra no mês, aplicando alterações opcionais. */
export function materialize(ctx: Ctx, rule: Recurrence, month: MonthKey, patch: EntryPatch = {}): Transaction {
  const now = ctx.now();
  return applyPatch(
    {
      // id fixo por (regra, mês): dois aparelhos que pagam a mesma ocorrência geram o mesmo registro
      id: occurrenceId(rule.id, month),
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
      type: rule.type,
      description: rule.description,
      amountCents: rule.amountCents,
      date: dateForDay(month, rule.day),
      paid: false,
      categoryId: rule.categoryId,
      accountId: rule.accountId,
      notes: rule.notes,
      recurrenceId: rule.id,
      occurrenceMonth: month,
      groupId: null,
      installmentNumber: null,
      installmentTotal: null,
      cardId: rule.cardId,
      invoiceMonth: null,
      invoicePayment: false,
    },
    patch,
    now,
  );
}

function applyPatch(t: Transaction, patch: EntryPatch, now: string): Transaction {
  const next = { ...t, updatedAt: now };
  if (patch.type !== undefined) next.type = patch.type;
  if (patch.description !== undefined) next.description = patch.description.trim();
  if (patch.amountCents !== undefined) next.amountCents = patch.amountCents;
  if (patch.date !== undefined) next.date = patch.date;
  if (patch.paid !== undefined) next.paid = patch.paid;
  if (patch.categoryId !== undefined) next.categoryId = patch.categoryId;
  if (patch.accountId !== undefined) next.accountId = patch.accountId;
  if (patch.notes !== undefined) next.notes = patch.notes.trim();
  if (patch.cardId !== undefined) next.cardId = patch.cardId;
  if (patch.invoiceMonth !== undefined) next.invoiceMonth = patch.invoiceMonth;
  if (next.cardId && !next.invoicePayment) {
    next.accountId = null;
    next.paid = false;
  } else if (!next.cardId) {
    next.invoiceMonth = null;
  }
  return next;
}

function applyRulePatch(r: Recurrence, patch: EntryPatch, now: string): Recurrence {
  const next = { ...r, updatedAt: now };
  if (patch.type !== undefined) next.type = patch.type;
  if (patch.description !== undefined) next.description = patch.description.trim();
  if (patch.amountCents !== undefined) next.amountCents = patch.amountCents;
  if (patch.date !== undefined) next.day = dayOf(patch.date);
  if (patch.categoryId !== undefined) next.categoryId = patch.categoryId;
  if (patch.accountId !== undefined) next.accountId = patch.accountId;
  if (patch.notes !== undefined) next.notes = patch.notes.trim();
  if (patch.cardId !== undefined) next.cardId = patch.cardId;
  if (next.cardId) next.accountId = null;
  return next;
}

/** Campos que se propagam para outras ocorrências/parcelas (data e "pago" são de cada uma). */
function sharedPatch(patch: EntryPatch): EntryPatch {
  const { date: _d, paid: _p, invoiceMonth: _i, ...rest } = patch;
  return rest;
}

export interface State {
  transactions: Transaction[];
  recurrences: Recurrence[];
}

const findTx = (s: State, id: string | null) => (id ? s.transactions.find((t) => t.id === id) : undefined);
const findRule = (s: State, id: string | null) => (id ? s.recurrences.find((r) => r.id === id) : undefined);

export function editItem(ctx: Ctx, state: State, item: ListItem, patch: EntryPatch, scope: Scope): Changes {
  const out = empty();
  const now = ctx.now();
  const rule = findRule(state, item.recurrenceId);
  const tx = findTx(state, item.transactionId);

  if (!rule) {
    if (!tx) return out;
    out.transactions.push(applyPatch(tx, patch, now));
    if (tx.groupId && scope !== 'this') {
      const shared = sharedPatch(patch);
      for (const other of state.transactions) {
        if (other.id === tx.id || other.groupId !== tx.groupId || other.deletedAt) continue;
        if (scope === 'future' && (other.installmentNumber ?? 0) < (tx.installmentNumber ?? 0)) continue;
        out.transactions.push(applyPatch(other, shared, now));
      }
    }
    return out;
  }

  const month = item.occurrenceMonth ?? monthOf(item.date);
  const current = tx ? applyPatch(tx, patch, now) : materialize(ctx, rule, month, patch);

  if (scope === 'this') {
    out.transactions.push(current);
    return out;
  }

  const shared = sharedPatch(patch);
  if (scope === 'all' || monthDiff(rule.startMonth, month) <= 0) {
    out.recurrences.push(applyRulePatch(rule, patch, now));
    if (tx) out.transactions.push(current);
    // ocorrências futuras já gravadas e ainda não pagas acompanham a mudança
    for (const t of state.transactions) {
      if (t.recurrenceId !== rule.id || t.deletedAt || t.paid || t.id === tx?.id) continue;
      if (scope === 'future' && monthDiff(month, t.occurrenceMonth ?? t.date.slice(0, 7)) < 0) continue;
      out.transactions.push(applyPatch(t, shared, now));
    }
    return out;
  }

  // "este e os próximos" a partir de um mês depois do início: divide a regra
  const ended: Recurrence = { ...rule, endMonth: shiftMonth(month, -1), updatedAt: now };
  const fresh: Recurrence = {
    ...applyRulePatch(rule, patch, now),
    id: ctx.newId(),
    createdAt: now,
    startMonth: month,
    endMonth: rule.endMonth,
  };
  out.recurrences.push(ended, fresh);
  const moved = { ...current, recurrenceId: fresh.id };
  out.transactions.push(moved);
  for (const t of state.transactions) {
    if (t.recurrenceId !== rule.id || t.id === tx?.id) continue;
    const m = t.occurrenceMonth ?? t.date.slice(0, 7);
    if (monthDiff(month, m) < 0) continue;
    const base = { ...t, recurrenceId: fresh.id, updatedAt: now };
    out.transactions.push(t.paid || t.deletedAt ? base : applyPatch(base, shared, now));
  }
  return out;
}

export function togglePaid(ctx: Ctx, state: State, item: ListItem): Changes {
  const out = empty();
  const tx = findTx(state, item.transactionId);
  if (tx?.invoicePayment) {
    // desmarcar o pagamento de uma fatura = desfazer o pagamento
    const now = ctx.now();
    out.transactions.push({ ...tx, deletedAt: now, updatedAt: now });
    return out;
  }
  if (tx?.cardId) return out; // compra no cartão não tem "pago": quem paga é a fatura
  if (tx) {
    out.transactions.push({ ...tx, paid: !tx.paid, updatedAt: ctx.now() });
    return out;
  }
  const rule = findRule(state, item.recurrenceId);
  if (rule && item.occurrenceMonth) out.transactions.push(materialize(ctx, rule, item.occurrenceMonth, { paid: true }));
  return out;
}

export function deleteItem(ctx: Ctx, state: State, item: ListItem, scope: Scope): Changes {
  const out = empty();
  const now = ctx.now();
  const rule = findRule(state, item.recurrenceId);
  const tx = findTx(state, item.transactionId);

  if (!rule) {
    if (!tx) return out;
    out.transactions.push({ ...tx, deletedAt: now, updatedAt: now });
    if (tx.groupId && scope !== 'this') {
      for (const other of state.transactions) {
        if (other.id === tx.id || other.groupId !== tx.groupId || other.deletedAt) continue;
        if (scope === 'future' && (other.installmentNumber ?? 0) < (tx.installmentNumber ?? 0)) continue;
        out.transactions.push({ ...other, deletedAt: now, updatedAt: now });
      }
    }
    return out;
  }

  const month = item.occurrenceMonth ?? monthOf(item.date);

  if (scope === 'this') {
    // a ocorrência excluída fica gravada como marcador de "mês pulado"
    const marker = tx ?? materialize(ctx, rule, month);
    out.transactions.push({ ...marker, deletedAt: now, updatedAt: now });
    return out;
  }

  const fromStart = scope === 'all' || monthDiff(rule.startMonth, month) <= 0;
  out.recurrences.push(
    fromStart ? { ...rule, deletedAt: now, updatedAt: now } : { ...rule, endMonth: shiftMonth(month, -1), updatedAt: now },
  );
  // histórico pago é mantido; pendências a partir do mês são removidas
  for (const t of state.transactions) {
    if (t.recurrenceId !== rule.id || t.deletedAt || t.paid) continue;
    const m = t.occurrenceMonth ?? t.date.slice(0, 7);
    if (!fromStart && monthDiff(month, m) < 0) continue;
    out.transactions.push({ ...t, deletedAt: now, updatedAt: now });
  }
  return out;
}

/** Encerra uma recorrência no mês informado (último mês em que ela ocorre). */
export function endRecurrence(ctx: Ctx, rule: Recurrence, lastMonth: MonthKey): Changes {
  const now = ctx.now();
  if (monthDiff(rule.startMonth, lastMonth) < 0) {
    return { transactions: [], recurrences: [{ ...rule, deletedAt: now, updatedAt: now }] };
  }
  return { transactions: [], recurrences: [{ ...rule, endMonth: lastMonth, updatedAt: now }] };
}

/**
 * Registra o pagamento de uma fatura: um lançamento de saída na conta,
 * com id fixo por (cartão, mês) — pagar de novo no outro aparelho não duplica.
 */
export function payInvoice(
  ctx: Ctx,
  args: { cardId: string; cardName: string; invoiceMonth: MonthKey; accountId: string | null; amountCents: number; date: DateISO; categoryId: string | null; existing?: Transaction },
): Changes {
  const now = ctx.now();
  const base: Transaction = args.existing ?? {
    id: stableId(`invoice:${args.cardId}:${args.invoiceMonth}`),
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
    type: 'expense',
    description: '',
    amountCents: 0,
    date: args.date,
    paid: true,
    categoryId: args.categoryId,
    accountId: args.accountId,
    notes: '',
    recurrenceId: null,
    occurrenceMonth: null,
    groupId: null,
    installmentNumber: null,
    installmentTotal: null,
    cardId: args.cardId,
    invoiceMonth: args.invoiceMonth,
    invoicePayment: true,
  };
  return {
    recurrences: [],
    transactions: [
      {
        ...base,
        description: `Fatura ${args.cardName}`,
        amountCents: args.amountCents,
        date: args.date,
        accountId: args.accountId,
        paid: true,
        deletedAt: null,
        updatedAt: now,
      },
    ],
  };
}
