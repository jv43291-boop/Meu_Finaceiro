/**
 * "Revalidar integridade": procura inconsistências nos dados do aparelho.
 * Só DIAGNOSTICA — não corrige nada sozinho (correção automática precisa de
 * decisão do João caso a caso). Devolve códigos e contagens, sem valores nem
 * descrições, para poder ir no diagnóstico exportado sem dado financeiro.
 */
import type { Account, Category, CreditCard, Goal, PayeeRule, Recurrence, Transaction } from './types';

export interface IntegrityIssue {
  code: string;
  /** explicação para a pessoa */
  label: string;
  count: number;
  /** alguns ids afetados, para investigar (não são exportados) */
  sampleIds: string[];
}

interface Snap {
  accounts: Account[];
  categories: Category[];
  recurrences: Recurrence[];
  transactions: Transaction[];
  cards: CreditCard[];
  goals: Goal[];
  payeeRules: PayeeRule[];
}

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const MONTH = /^\d{4}-\d{2}$/;

export function checkIntegrity(s: Snap): IntegrityIssue[] {
  const issues = new Map<string, IntegrityIssue>();
  const add = (code: string, label: string, id: string) => {
    const cur = issues.get(code) ?? { code, label, count: 0, sampleIds: [] };
    cur.count++;
    if (cur.sampleIds.length < 5) cur.sampleIds.push(id);
    issues.set(code, cur);
  };
  const live = <T extends { deletedAt: string | null }>(xs: T[]) => xs.filter((x) => !x.deletedAt);
  const accounts = new Set(live(s.accounts).map((a) => a.id));
  const categories = new Set(live(s.categories).map((c) => c.id));
  const cards = new Set(live(s.cards).map((k) => k.id));
  const rules = new Set(live(s.recurrences).map((r) => r.id));

  const occurrences = new Map<string, number>();
  const pixIds = new Map<string, number>();
  for (const t of live(s.transactions)) {
    if (!Number.isInteger(t.amountCents) || t.amountCents <= 0) add('tx_amount', 'Lançamento com valor zero, negativo ou quebrado', t.id);
    if (!DATE.test(t.date)) add('tx_date', 'Lançamento com data inválida', t.id);
    if (t.categoryId && !categories.has(t.categoryId)) add('tx_category', 'Lançamento aponta para categoria que não existe mais', t.id);
    if (t.accountId && !accounts.has(t.accountId)) add('tx_account', 'Lançamento aponta para conta que não existe mais', t.id);
    if (t.cardId && !cards.has(t.cardId)) add('tx_card', 'Lançamento aponta para cartão que não existe mais', t.id);
    if (t.cardId && !t.invoicePayment && t.accountId) add('tx_card_account', 'Compra no cartão também ligada a uma conta (pode contar duas vezes)', t.id);
    if (t.invoicePayment && (!t.cardId || !t.invoiceMonth || !MONTH.test(t.invoiceMonth))) add('tx_invoice_payment', 'Pagamento de fatura sem cartão ou sem mês da fatura', t.id);
    if (t.recurrenceId && !rules.has(t.recurrenceId)) add('tx_rule', 'Ocorrência de um fixo que foi apagado', t.id);
    if (t.recurrenceId && t.occurrenceMonth) {
      const k = `${t.recurrenceId}:${t.occurrenceMonth}`;
      occurrences.set(k, (occurrences.get(k) ?? 0) + 1);
      if (occurrences.get(k) === 2) add('tx_occurrence_dup', 'Mesmo mês de um fixo lançado duas vezes', t.id);
    }
    if (t.externalId) {
      pixIds.set(t.externalId, (pixIds.get(t.externalId) ?? 0) + 1);
      if (pixIds.get(t.externalId) === 2) add('tx_pix_dup', 'Mesmo comprovante de Pix lançado duas vezes', t.id);
    }
  }
  for (const r of live(s.recurrences)) {
    if (!Number.isInteger(r.amountCents) || r.amountCents <= 0) add('rule_amount', 'Fixo com valor zero, negativo ou quebrado', r.id);
    if (r.day < 1 || r.day > 31) add('rule_day', 'Fixo com dia do mês inválido', r.id);
    if (!MONTH.test(r.startMonth) || (r.endMonth && (!MONTH.test(r.endMonth) || r.endMonth < r.startMonth))) add('rule_months', 'Fixo com mês de início/fim inválido', r.id);
    if (r.categoryId && !categories.has(r.categoryId)) add('rule_category', 'Fixo aponta para categoria que não existe mais', r.id);
    if (r.accountId && !accounts.has(r.accountId)) add('rule_account', 'Fixo aponta para conta que não existe mais', r.id);
    if (r.cardId && !cards.has(r.cardId)) add('rule_card', 'Fixo aponta para cartão que não existe mais', r.id);
  }
  for (const k of live(s.cards)) {
    if (k.closingDay < 1 || k.closingDay > 31 || k.dueDay < 1 || k.dueDay > 31) add('card_days', 'Cartão com dia de fechamento/vencimento inválido', k.id);
    if (k.accountId && !accounts.has(k.accountId)) add('card_account', 'Cartão aponta para conta de pagamento que não existe mais', k.id);
  }
  for (const g of live(s.goals)) {
    if (g.targetCents < 0 || g.savedCents < 0) add('goal_amount', 'Meta com valor negativo', g.id);
  }
  for (const p of live(s.payeeRules)) {
    if (p.categoryId && !categories.has(p.categoryId)) add('payee_category', 'Regra de recebedor aponta para categoria que não existe mais', p.id);
    if (p.accountId && !accounts.has(p.accountId)) add('payee_account', 'Regra de recebedor aponta para conta que não existe mais', p.id);
  }
  if (accounts.size === 0) add('no_account', 'Nenhuma conta cadastrada', '-');
  return [...issues.values()].sort((a, b) => b.count - a.count);
}
