/**
 * Em que mês um comprovante entra. Regra: vale a DATA DO PIX escrita no
 * comprovante, nunca o dia em que ele foi lido. Um Pix de agosto lido em
 * setembro entra em agosto.
 */
import { monthDiff, monthLabel, monthOf, type DateISO, type MonthKey } from './dates';

export type ReceiptWhen =
  /** o comprovante não tem data legível: a pessoa precisa digitar */
  | { kind: 'missing' }
  /** data depois de hoje: quase sempre erro de leitura */
  | { kind: 'future'; month: MonthKey; label: string }
  | { kind: 'current'; month: MonthKey; label: string }
  /** de um mês anterior; `old` quando passa de 3 meses (vale conferir) */
  | { kind: 'past'; month: MonthKey; label: string; monthsAgo: number; old: boolean };

export function receiptWhen(date: DateISO | null, today: DateISO): ReceiptWhen {
  if (!date) return { kind: 'missing' };
  const month = monthOf(date);
  const label = monthLabel(month);
  if (date > today) return { kind: 'future', month, label };
  const monthsAgo = monthDiff(month, monthOf(today));
  if (monthsAgo === 0) return { kind: 'current', month, label };
  return { kind: 'past', month, label, monthsAgo, old: monthsAgo > 3 };
}
