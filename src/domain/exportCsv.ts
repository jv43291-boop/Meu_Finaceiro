/**
 * Exportar para planilha (CSV no padrão brasileiro, abre direto no Excel e no
 * Google Planilhas): separador ";", vírgula decimal, datas dd/mm/aaaa e BOM
 * UTF-8 para os acentos aparecerem certos.
 *
 * Entram os lançamentos do período (pela data) e, se pedido, as recorrências
 * previstas ainda não lançadas. Despesas saem com valor negativo para a soma
 * da coluna dar o resultado. Atenção: compra no cartão e pagamento da fatura
 * aparecem os dois — a coluna "Tipo" separa, para não somar em dobro.
 */
import { formatDateBR, monthOf, shiftMonth, shortMonthLabel, type DateISO } from './dates';
import { invoiceMonthFor, isCardPurchase } from './cards';
import { itemsForMonth, materializedIndex } from './recurrence';
import type { Account, Category, CreditCard, ListItem, Recurrence, Transaction } from './types';

export const CSV_HEADER = ['Data', 'Descrição', 'Tipo', 'Valor', 'Situação', 'Categoria', 'Conta', 'Cartão', 'Fatura', 'Parcela', 'Observações'];

export interface ExportInput {
  from: DateISO;
  to: DateISO;
  transactions: Transaction[];
  recurrences: Recurrence[];
  categories: Category[];
  accounts: Account[];
  cards: CreditCard[];
  includeForecast: boolean;
}

/** Itens do período, em ordem de data. */
export function exportItems(input: ExportInput): ListItem[] {
  const index = materializedIndex(input.transactions);
  const out: ListItem[] = [];
  for (let m = monthOf(input.from); m <= monthOf(input.to); m = shiftMonth(m, 1)) {
    for (const it of itemsForMonth(m, input.transactions, input.recurrences, index)) {
      if (it.date < input.from || it.date > input.to) continue;
      if (it.virtual && !input.includeForecast) continue;
      out.push(it);
    }
  }
  return out;
}

/** Célula CSV: aspas quando precisa; neutraliza fórmulas (=, +, -, @) em texto livre. */
export function csvCell(value: string): string {
  let v = value.replace(/\r?\n/g, ' ');
  if (/^[=+\-@\t]/.test(v)) v = `'${v}`;
  return /[;"]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
}

/** 123456 → "1234,56"; -500 → "-5,00" (sem separador de milhar, para a planilha ler como número). */
export function csvNumber(cents: number): string {
  const sign = cents < 0 ? '-' : '';
  const abs = Math.abs(cents);
  return `${sign}${Math.floor(abs / 100)},${String(abs % 100).padStart(2, '0')}`;
}

function kindLabel(it: ListItem): string {
  if (it.invoicePayment) return 'Pagamento de fatura';
  if (it.type === 'income') return 'Receita';
  return isCardPurchase(it) ? 'Despesa no cartão' : 'Despesa';
}

function statusLabel(it: ListItem): string {
  if (it.virtual) return 'Previsto';
  if (isCardPurchase(it)) return 'Na fatura';
  if (it.paid) return it.type === 'income' ? 'Recebido' : 'Pago';
  return 'Pendente';
}

function invoiceOf(it: ListItem, cards: Map<string, CreditCard>): string {
  if (!it.cardId) return '';
  const k = cards.get(it.cardId);
  const m = it.invoiceMonth ?? (k && isCardPurchase(it) ? invoiceMonthFor(k, it.date) : null);
  return m ? shortMonthLabel(m) : '';
}

export function buildCsv(input: ExportInput): string {
  const cat = new Map(input.categories.map((c) => [c.id, c.name]));
  const acc = new Map(input.accounts.map((a) => [a.id, a.name]));
  const card = new Map(input.cards.map((k) => [k.id, k]));
  const lines = [CSV_HEADER.map(csvCell).join(';')];
  for (const it of exportItems(input)) {
    const signed = it.type === 'expense' ? -it.amountCents : it.amountCents;
    const row = [
      formatDateBR(it.date),
      csvCell(it.description),
      kindLabel(it),
      csvNumber(signed),
      statusLabel(it),
      csvCell(it.categoryId ? cat.get(it.categoryId) ?? '' : ''),
      csvCell(isCardPurchase(it) ? '' : it.accountId ? acc.get(it.accountId) ?? '' : ''),
      csvCell(it.cardId ? card.get(it.cardId)?.name ?? '' : ''),
      invoiceOf(it, card),
      it.installmentNumber && it.installmentTotal ? `${it.installmentNumber}/${it.installmentTotal}` : '',
      csvCell(it.notes ?? ''),
    ];
    lines.push(row.join(';'));
  }
  return '\uFEFF' + lines.join('\r\n') + '\r\n';
}

export function exportFileName(from: DateISO, to: DateISO): string {
  return `live-financas_${from}_a_${to}.csv`;
}
