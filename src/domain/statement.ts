/**
 * Lê um EXTRATO bancário (PDF → OCR → linhas visuais) e separa cada lançamento:
 * data, descrição, valor e se foi gasto ou entrada.
 *
 * Nada é lançado daqui: o resultado sempre passa pela tela de conferência.
 *
 * Regras (financeiras, ficam no domínio):
 * - o sentido vem do sinal do valor ("-45,90", "45,90 D", "+150,00", "150,00 C");
 *   sem sinal, de palavras da descrição ("Pix enviado", "Salário"…); sem nada disso,
 *   fica em aberto e a pessoa escolhe — nunca vira gasto sozinho;
 * - linhas de saldo e totais não são lançamentos;
 * - aplicação, resgate, fatura do cartão e transferência entre contas próprias vêm
 *   desmarcadas: mexem no saldo, mas não são gasto nem receita de verdade.
 */
import type { DateISO } from './dates';
import { norm, type Row } from './pixReceipt';

export type StatementType = 'expense' | 'income';

export interface StatementLine {
  date: DateISO;
  description: string;
  /** linha de cima que explica o lançamento (ex.: "Compra no débito") */
  detail: string | null;
  amountCents: number;
  /** null = o extrato não diz; a tela pede para escolher */
  type: StatementType | null;
  typeSource: 'sign' | 'keyword' | null;
  /** aplicação, resgate, fatura, entre contas: vem desmarcada */
  transferLike: boolean;
  /** chave estável para não importar a mesma linha duas vezes */
  key: string;
}

export interface Statement {
  lines: StatementLine[];
  /** linhas com valor que ficaram de fora por não ter data */
  skipped: number;
  from: DateISO | null;
  to: DateISO | null;
}

const MONTHS: Record<string, number> = {
  jan: 1, fev: 2, mar: 3, abr: 4, mai: 5, jun: 6, jul: 7, ago: 8, set: 9, out: 10, nov: 11, dez: 12,
};
const MON = 'jan|fev|mar|abr|mai|jun|jul|ago|set|out|nov|dez';

function iso(y: number, m: number, d: number): DateISO | null {
  if (y < 100) y += 2000;
  if (m < 1 || m > 12 || d < 1 || d > 31) return null;
  const dt = new Date(y, m - 1, d);
  if (dt.getMonth() !== m - 1) return null;
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

/** data no começo da linha: "02/09/2026", "02/09", "02 SET 2026", "02 set", "02/set/2026" */
export function leadingDate(text: string, year: number): { date: DateISO; rest: string } | null {
  const t = text.trim();
  let m = t.match(/^(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?(?!\d)/);
  if (m) {
    const date = iso(m[3] ? +m[3] : year, +m[2], +m[1]);
    return date ? { date, rest: t.slice(m[0].length) } : null;
  }
  const n = norm(t);
  m = n.match(new RegExp(`^(\\d{1,2})(?:\\s+de)?[\\s/]+(${MON})[a-z]*\\.?(?:(?:\\s+de)?[\\s/]+(\\d{4}))?(?![a-z])`));
  if (m) {
    const date = iso(m[3] ? +m[3] : year, MONTHS[m[2]], +m[1]);
    // corta no texto original o mesmo número de "palavras" consumidas
    const words = m[0].split(/[\s/]+/).length;
    const rest = t.split(/[\s/]+/).slice(words).join(' ');
    return date ? { date, rest } : null;
  }
  return null;
}

const AMOUNT = /([+\-−–])?\s*(?:r\s?\$\s*)?([+\-−–])?\s*(\d{1,3}(?:\.\d{3})+,\d{2}|\d+,\d{2})(-)?(?!\d)(?:\s*([DC])(?![a-z]))?/gi;

interface Amount { cents: number; sign: 1 | -1 | 0; start: number; end: number }

function amounts(text: string): Amount[] {
  const out: Amount[] = [];
  for (const m of text.matchAll(AMOUNT)) {
    const cents = Math.round(parseFloat(m[3].replace(/\./g, '').replace(',', '.')) * 100);
    if (!Number.isFinite(cents) || cents <= 0) continue;
    const pre = m[1] ?? m[2];
    const dc = m[5]?.toUpperCase();
    let sign: 1 | -1 | 0 = 0;
    if (pre && pre !== '+') sign = -1;
    else if (pre === '+') sign = 1;
    if (dc === 'D' || m[4]) sign = -1;
    else if (dc === 'C') sign = 1;
    out.push({ cents, sign, start: m.index ?? 0, end: (m.index ?? 0) + m[0].length });
  }
  return out;
}

const SKIP = /\b(saldo|total de (entradas|saidas)|total do dia|total|limite (disponivel|da conta)|lancamentos futuros|resumo)\b/;
const HEADER = /^(data|dt\.?)\s+(lancamento|historico|descricao)/;
const INCOME = /\b(rend pago|recebid[oa]|recebimento|salario|proventos?|deposito|estorno|reembolso|rendimentos?|devolucao|cashback|credito em conta|ted recebida|doc recebido|transferencia recebida)\b/;
const EXPENSE = /\b(enviad[oa]|compra|compras|pagamento|pagto|pgto|debito|saque|tarifa|boleto|iof|juros|anuidade|mensalidade|parcela|transferencia enviada|pix enviado)\b/;
const TRANSFER = /\b(aplic[a-z]*|resgate|fatura|cartao de credito|poupanca|entre contas|mesma titularidade|investimentos?|cdb|tesouro)\b/;

function keywordType(desc: string): StatementType | null {
  const n = norm(desc);
  const i = n.search(INCOME);
  const e = n.search(EXPENSE);
  if (i < 0 && e < 0) return null;
  if (e < 0) return 'income';
  if (i < 0) return 'expense';
  return i < e ? 'income' : 'expense';
}

function clean(s: string): string {
  return s.replace(/\s+/g, ' ').replace(/^[\s\-–·|:]+|[\s\-–·|:]+$/g, '').trim();
}

/** ano do extrato: fim do período ("01/09/2026 a 30/09/2026"), senão a primeira data completa */
function statementYear(all: string, fallback: number): { year: number; from: DateISO | null; to: DateISO | null } {
  const p = all.match(/(\d{2})\/(\d{2})\/(\d{4})\s*(?:a|ate|até|-|–)\s*(\d{2})\/(\d{2})\/(\d{4})/i);
  if (p) {
    const from = iso(+p[3], +p[2], +p[1]);
    const to = iso(+p[6], +p[5], +p[4]);
    return { year: +p[6], from, to };
  }
  const f = all.match(/\b\d{1,2}\/\d{1,2}\/(\d{4})\b/) ?? norm(all).match(new RegExp(`\\b\\d{1,2}(?:\\s+de)?\\s+(?:${MON})[a-z]*\\.?(?:\\s+de)?\\s+(\\d{4})\\b`));
  return { year: f ? +f[1] : fallback, from: null, to: null };
}

export function parseStatement(rows: Row[], fallbackYear = new Date().getFullYear()): Statement {
  const texts = rows.map((r) => r.join('   ').trim()).filter(Boolean);
  const { year, from, to } = statementYear(texts.join('\n'), fallbackYear);
  const lines: (StatementLine & { signed: boolean })[] = [];
  const seen = new Map<string, number>();
  let current: DateISO | null = null;
  let buffer: string[] = [];
  let skipped = 0;

  for (const text of texts) {
    const n = norm(text);
    if (HEADER.test(n)) continue;
    const lead = leadingDate(text, year);
    let rest = lead ? lead.rest : text;
    if (lead) current = lead.date;

    const found = amounts(rest);
    if (!found.length) {
      // título do dia ("02 SET 2026") ou pedaço de descrição que continua na linha de baixo
      if (lead) buffer = clean(rest) && !SKIP.test(norm(rest)) ? [clean(rest)] : [];
      // antes da primeira data é cabeçalho (nome, período…), não descrição
      else if (current && !SKIP.test(n) && /\p{L}{3}/u.test(text)) buffer = [...buffer, clean(text)].slice(-2);
      continue;
    }
    if (SKIP.test(norm(rest.slice(0, found[0].start))) || (SKIP.test(n) && !/\p{L}{3}/u.test(rest.slice(0, found[0].start)))) {
      buffer = [];
      continue;
    }
    if (!current) {
      skipped++;
      buffer = [];
      continue;
    }

    // valor com sinal/D/C; senão o primeiro (o último costuma ser o saldo)
    const a = found.find((x) => x.sign !== 0) ?? found[0];
    rest = rest.slice(0, found[0].start) + ' ' + rest.slice(found[found.length - 1].end);
    if (!lead && !current) buffer = [];
    // Itaú cola a data no fim da descrição: "PIX TRANSF MARIA F02/09"
    let description = clean(rest.replace(/\bR\$\s*/gi, '')).replace(/-?\d{2}\/\d{2}$/, '');
    let detail: string | null = buffer.length ? clean(buffer.join(' · ')) : null;
    if (!/\p{L}{3}/u.test(description)) {
      description = detail ?? '';
      detail = null;
    }
    description = clean(description) || 'Lançamento do extrato';
    buffer = [];

    let type: StatementType | null = a.sign < 0 ? 'expense' : a.sign > 0 ? 'income' : null;
    let typeSource: StatementLine['typeSource'] = type ? 'sign' : null;
    if (!type) {
      type = keywordType(`${detail ?? ''} ${description}`);
      typeSource = type ? 'keyword' : null;
    }

    const base = `extrato:${current}:${a.cents}:${norm(description).replace(/[^a-z0-9]/g, '').slice(0, 40)}`;
    const k = (seen.get(base) ?? 0) + 1;
    seen.set(base, k);
    lines.push({
      date: current, description: description.slice(0, 200), detail: detail?.slice(0, 200) ?? null, amountCents: a.cents, type, typeSource,
      transferLike: TRANSFER.test(norm(`${detail ?? ''} ${description}`)) && !/\brend/.test(norm(description)), key: k > 1 ? `${base}#${k}` : base,
      signed: a.sign !== 0,
    });
  }

  // extrato em que só as saídas têm sinal ("-80,00") e nenhuma linha usa "+" ou "C":
  // valor sem sinal é entrada
  const neg = lines.some((l) => l.signed && l.type === 'expense');
  const pos = lines.some((l) => l.signed && l.type === 'income');
  const out: StatementLine[] = lines.map(({ signed, ...l }) =>
    neg && !pos && !signed ? { ...l, type: 'income', typeSource: 'sign' } : l,
  );
  return { lines: out, skipped, from, to };
}

/** lançamento que já existe no app com a mesma data, valor e sentido (ex.: Pix lançado pelo comprovante) */
export function findSimilarEntry<T extends { date: string; amountCents: number; type: string; deletedAt: string | null; externalId?: string | null }>(
  txs: T[], line: StatementLine, type: StatementType | null,
): T | null {
  return (
    txs.find((t) => !t.deletedAt && t.externalId === line.key) ??
    txs.find((t) => !t.deletedAt && t.date === line.date && t.amountCents === line.amountCents && (!type || t.type === type)) ??
    null
  );
}
