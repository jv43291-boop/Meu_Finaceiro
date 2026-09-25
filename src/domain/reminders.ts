/**
 * Lembretes de vencimento: decide QUAIS avisos agendar e QUANDO.
 * Função pura — quem agenda de verdade é src/state/reminders.tsx.
 *
 * Regras:
 * - só despesas ainda não pagas (contas, recorrências previstas e faturas de cartão);
 *   compras no cartão não avisam sozinhas, quem vence é a fatura;
 * - itens que vencem no mesmo dia viram UM aviso;
 * - o aviso sai `daysBefore` dias antes, na hora escolhida (horário do celular);
 * - avisos cujo horário já passou não são agendados;
 * - olha até `horizonDays` dias à frente e agenda no máximo `max` avisos
 *   (o iOS guarda só 64 agendados por app).
 */
import { addDays, monthOf, shiftMonth, todayISO, type DateISO } from './dates';
import { formatBRL } from './money';
import { cashItemsForMonth } from './summary';
import type { CreditCard, ListItem, Recurrence, Transaction } from './types';

export interface ReminderSettings {
  enabled: boolean;
  /** 0 = no dia, 1 = véspera, até 3 */
  daysBefore: number;
  /** 0..23 */
  hour: number;
  /** mostrar o valor no texto do aviso (aparece na tela bloqueada) */
  showAmounts: boolean;
}

export const DEFAULT_REMINDERS: ReminderSettings = { enabled: false, daysBefore: 1, hour: 9, showAmounts: false };

export interface PlannedReminder {
  /** identificador estável: mesmo dia de vencimento = mesmo id */
  id: string;
  dueDate: DateISO;
  fireAt: Date;
  title: string;
  body: string;
  count: number;
  totalCents: number;
}

export function parseReminderSettings(raw: string | null): ReminderSettings {
  if (!raw) return DEFAULT_REMINDERS;
  try {
    const v = JSON.parse(raw) as Partial<ReminderSettings>;
    const clamp = (n: unknown, lo: number, hi: number, d: number) => (typeof n === 'number' && Number.isFinite(n) ? Math.min(hi, Math.max(lo, Math.round(n))) : d);
    return {
      enabled: v.enabled === true,
      daysBefore: clamp(v.daysBefore, 0, 3, DEFAULT_REMINDERS.daysBefore),
      hour: clamp(v.hour, 0, 23, DEFAULT_REMINDERS.hour),
      showAmounts: v.showAmounts === true,
    };
  } catch {
    return DEFAULT_REMINDERS;
  }
}

/** Despesas em aberto que vencem de `from` até `to` (inclusive). */
export function dueItemsBetween(from: DateISO, to: DateISO, transactions: Transaction[], rules: Recurrence[], cards: CreditCard[], today: DateISO): ListItem[] {
  const out: ListItem[] = [];
  for (let m = monthOf(from); m <= monthOf(to); m = shiftMonth(m, 1)) {
    for (const it of cashItemsForMonth(m, transactions, rules, cards, today)) {
      if (it.type !== 'expense' || it.paid || it.invoicePayment) continue;
      if (it.amountCents <= 0) continue;
      if (it.date < from || it.date > to) continue;
      out.push(it);
    }
  }
  return out;
}

function whenLabel(daysBefore: number): string {
  if (daysBefore === 0) return 'hoje';
  if (daysBefore === 1) return 'amanhã';
  return `em ${daysBefore} dias`;
}

function joinNames(names: string[]): string {
  const shown = names.slice(0, 3);
  const rest = names.length - shown.length;
  if (rest > 0) return `${shown.join(', ')} e mais ${rest}`;
  if (shown.length <= 1) return shown.join('');
  return `${shown.slice(0, -1).join(', ')} e ${shown[shown.length - 1]}`;
}

function localDate(date: DateISO, hour: number): Date {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(y, m - 1, d, hour, 0, 0, 0);
}

export function planReminders(
  state: { transactions: Transaction[]; recurrences: Recurrence[]; cards: CreditCard[] },
  settings: ReminderSettings,
  now: Date,
  opts: { horizonDays?: number; max?: number } = {},
): PlannedReminder[] {
  if (!settings.enabled) return [];
  const today = todayISO(now);
  const horizon = opts.horizonDays ?? 30;
  const max = opts.max ?? 40;
  const items = dueItemsBetween(today, addDays(today, horizon), state.transactions, state.recurrences, state.cards, today);

  const byDay = new Map<DateISO, ListItem[]>();
  for (const it of items) {
    const list = byDay.get(it.date) ?? [];
    list.push(it);
    byDay.set(it.date, list);
  }

  const out: PlannedReminder[] = [];
  for (const [dueDate, list] of [...byDay.entries()].sort(([a], [b]) => (a < b ? -1 : 1))) {
    const fireAt = localDate(addDays(dueDate, -settings.daysBefore), settings.hour);
    if (fireAt.getTime() <= now.getTime()) continue;
    const total = list.reduce((s, i) => s + i.amountCents, 0);
    const when = whenLabel(settings.daysBefore);
    const names = list.map((i) => i.description || (i.invoice ? 'Fatura do cartão' : 'Conta'));
    const title = list.length === 1 ? `Vence ${when}: ${names[0]}` : `${list.length} contas vencem ${when}`;
    const amount = settings.showAmounts ? formatBRL(total) : null;
    const body =
      list.length === 1
        ? amount ?? 'Toque para abrir o Live e marcar como pago.'
        : [joinNames(names), amount].filter(Boolean).join(' · ');
    out.push({ id: `live-venc-${dueDate}`, dueDate, fireAt, title, body, count: list.length, totalCents: total });
    if (out.length >= max) break;
  }
  return out;
}
