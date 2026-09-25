import type { DateISO, MonthKey } from './dates';

export type EntryType = 'income' | 'expense';

/** Campos comuns a todo registro sincronizável (fase 2: sync com Supabase). */
export interface SyncFields {
  id: string;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}

export interface Account extends SyncFields {
  name: string;
  kind: 'cash' | 'checking' | 'savings' | 'other';
  openingBalanceCents: number;
  color: string;
  archived: boolean;
}

export interface CreditCard extends SyncFields {
  name: string;
  limitCents: number;
  /** dia em que a fatura fecha; compras nesse dia ou depois entram na fatura seguinte */
  closingDay: number;
  dueDay: number;
  /** conta sugerida para pagar a fatura */
  accountId: string | null;
  color: string;
  archived: boolean;
}

export interface Category extends SyncFields {
  name: string;
  type: EntryType;
  icon: string;
  color: string;
  archived: boolean;
}

/**
 * Regra de recorrência: "R$ X todo dia D, de start até end (ou para sempre)".
 * As ocorrências não existem no banco até serem pagas, editadas ou puladas.
 */
export interface Recurrence extends SyncFields {
  type: EntryType;
  description: string;
  amountCents: number;
  categoryId: string | null;
  accountId: string | null;
  day: number;
  startMonth: MonthKey;
  endMonth: MonthKey | null;
  notes: string;
  /** recorrência no cartão (assinaturas): cada ocorrência vira compra na fatura */
  cardId: string | null;
}

export interface Transaction extends SyncFields {
  type: EntryType;
  description: string;
  amountCents: number;
  date: DateISO;
  paid: boolean;
  categoryId: string | null;
  accountId: string | null;
  notes: string;
  /** Ocorrência materializada de uma recorrência. */
  recurrenceId: string | null;
  occurrenceMonth: MonthKey | null;
  /** Parcelamento: lançamentos do mesmo grupo. */
  groupId: string | null;
  installmentNumber: number | null;
  installmentTotal: number | null;
  /** compra no cartão (não mexe no saldo da conta) ou pagamento de fatura */
  cardId: string | null;
  /** mês de VENCIMENTO da fatura em que a compra entra; null = calcular pela data */
  invoiceMonth: MonthKey | null;
  /** true = este lançamento é o pagamento da fatura (sai da conta) */
  invoicePayment: boolean;
}

/**
 * Item exibido nas listas: um lançamento real ou uma ocorrência projetada
 * de uma recorrência (virtual, ainda não gravada).
 */
export interface ListItem {
  key: string;
  virtual: boolean;
  transactionId: string | null;
  recurrenceId: string | null;
  occurrenceMonth: MonthKey | null;
  type: EntryType;
  description: string;
  amountCents: number;
  date: DateISO;
  paid: boolean;
  categoryId: string | null;
  accountId: string | null;
  notes: string;
  installmentNumber: number | null;
  installmentTotal: number | null;
  cardId: string | null;
  invoiceMonth: MonthKey | null;
  /** fatura de cartão ainda não paga (item calculado) */
  invoice: boolean;
  invoicePayment: boolean;
}

export function virtualKey(recurrenceId: string, month: MonthKey): string {
  return `r:${recurrenceId}:${month}`;
}

export function invoiceKey(cardId: string, month: MonthKey): string {
  return `f:${cardId}:${month}`;
}

export function parseItemKey(key: string):
  | { kind: 'tx'; id: string }
  | { kind: 'virtual'; recurrenceId: string; month: MonthKey }
  | { kind: 'invoice'; cardId: string; month: MonthKey } {
  if (key.startsWith('f:')) {
    const [, cardId, month] = key.split(':');
    return { kind: 'invoice', cardId, month };
  }
  if (key.startsWith('r:')) {
    const [, recurrenceId, month] = key.split(':');
    return { kind: 'virtual', recurrenceId, month };
  }
  return { kind: 'tx', id: key };
}
