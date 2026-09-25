/**
 * Lê um comprovante de Pix a partir do texto reconhecido na imagem (OCR).
 *
 * Cada banco monta o comprovante de um jeito, então a leitura é por rótulos
 * ("Valor", "Para", "Destino", "Nome", "CPF", "Data", "ID da transação") e não
 * por posição fixa. As linhas chegam com a posição na imagem: primeiro elas são
 * remontadas em "linhas visuais" (rótulo à esquerda + valor à direita ficam
 * juntos), depois os campos são procurados.
 *
 * Nada aqui é definitivo: o resultado sempre passa pela tela de conferência.
 */
import type { DateISO } from './dates';

export interface TextLine {
  text: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Uma linha visual: as partes que estão na mesma altura, da esquerda para a direita. */
export type Row = string[];

export type PixDirection = 'sent' | 'received';

export interface PixReceipt {
  amountCents: number | null;
  /** nome de quem recebeu (Pix enviado) ou de quem mandou (Pix recebido) */
  counterpartName: string | null;
  /** dígitos visíveis do CPF/CNPJ dessa pessoa (ex.: "123456") */
  counterpartDoc: string | null;
  date: DateISO | null;
  time: string | null;
  /** ID do Pix (E2E, 32 caracteres) ou outro código de autenticação */
  pixId: string | null;
  direction: PixDirection;
  /** banco do app que gerou o comprovante, quando dá para saber */
  bank: string | null;
  /** o texto parece mesmo um comprovante de Pix */
  looksLikePix: boolean;
}

/** minúsculo, sem acento, espaços simples */
export function norm(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

/** Junta as linhas que estão na mesma altura (tolerância de meia linha). */
export function toRows(lines: TextLine[]): Row[] {
  const items = lines
    .filter((l) => l.text.trim())
    .map((l) => ({ ...l, text: l.text.trim(), cy: l.y + l.height / 2 }))
    .sort((a, b) => a.cy - b.cy || a.x - b.x);
  const rows: { cy: number; h: number; items: typeof items }[] = [];
  for (const it of items) {
    const last = rows[rows.length - 1];
    const tol = Math.max(4, Math.min(last?.h ?? it.height, it.height) * 0.55);
    if (last && Math.abs(it.cy - last.cy) <= tol) {
      last.items.push(it);
      last.cy = (last.cy * (last.items.length - 1) + it.cy) / last.items.length;
    } else {
      rows.push({ cy: it.cy, h: it.height, items: [it] });
    }
  }
  return rows.map((r) => r.items.sort((a, b) => a.x - b.x).map((i) => i.text));
}

/** Para testes e para quando o OCR não dá posição: uma linha de texto = uma linha visual. */
export function rowsFromText(text: string): Row[] {
  return text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => l.split(/\s{3,}|\t/).map((p) => p.trim()).filter(Boolean));
}

// ---------- valores ----------

const MONEY = /(?:r\s?\$|rs\b|r\$)\s*-?\s*(\d{1,3}(?:[.\s]\d{3})*,\d{2}|\d+,\d{2})/i;
const MONEY_LOOSE = /(?:^|\s)(\d{1,3}(?:\.\d{3})*,\d{2})(?:\s|$)/;

export function parseMoneyBR(s: string, loose = false): number | null {
  const m = s.match(MONEY) ?? (loose ? s.match(MONEY_LOOSE) : null);
  if (!m) return null;
  const digits = m[1].replace(/[.\s]/g, '').replace(',', '.');
  const v = Math.round(parseFloat(digits) * 100);
  return Number.isFinite(v) && v > 0 ? v : null;
}

const MONTHS: Record<string, number> = {
  jan: 1, fev: 2, mar: 3, abr: 4, mai: 5, jun: 6, jul: 7, ago: 8, set: 9, out: 10, nov: 11, dez: 12,
};

function iso(y: number, m: number, d: number): DateISO | null {
  if (y < 100) y += 2000;
  if (m < 1 || m > 12 || d < 1 || d > 31 || y < 2000 || y > 2100) return null;
  const dt = new Date(y, m - 1, d);
  if (dt.getMonth() !== m - 1) return null;
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

export function parseDateBR(s: string): DateISO | null {
  const n = norm(s);
  let m = n.match(/\b(\d{1,2})\/(\d{1,2})\/(\d{2,4})\b/);
  if (m) return iso(+m[3], +m[2], +m[1]);
  m = n.match(/\b(\d{1,2})(?:\s+de)?\s+(jan|fev|mar|abr|mai|jun|jul|ago|set|out|nov|dez)[a-z]*\.?(?:\s+de)?\s+(\d{4})\b/);
  if (m) return iso(+m[3], MONTHS[m[2]], +m[1]);
  m = n.match(/\b(\d{4})-(\d{2})-(\d{2})\b/);
  if (m) return iso(+m[1], +m[2], +m[3]);
  return null;
}

function parseTime(s: string): string | null {
  const m = s.match(/\b([01]?\d|2[0-3])[:h]([0-5]\d)(?::[0-5]\d)?\b/);
  return m ? `${m[1].padStart(2, '0')}:${m[2]}` : null;
}

// ---------- rótulos ----------

const DEST = [
  'para', 'destino', 'recebedor', 'quem recebeu', 'favorecido', 'destinatario', 'dados do recebedor',
  'dados de quem recebeu', 'pago para', 'enviado para', 'transferido para', 'para quem', 'beneficiario',
  'conta destino', 'dados do destino', 'dados do favorecido', 'transferencia para',
];
const ORIGIN = [
  'de', 'origem', 'quem pagou', 'pagador', 'dados do pagador', 'dados de quem pagou', 'remetente',
  'conta de origem', 'conta origem', 'enviado por', 'dados da origem', 'quem enviou', 'dados de quem enviou',
];
/** rótulos de campo que nunca são o nome */
const FIELD = /^(cpf|cnpj|documento|instituicao|banco|agencia|ag\.?|conta|chave|chave pix|tipo|tipo de conta|data|horario|hora|valor|id|autenticacao|codigo|identificador|descricao|mensagem|situacao|status|ispb|numero|n[oº°])\b/;

function startsWithLabel(cell: string, labels: string[]): string | null {
  const n = norm(cell).replace(/[:\-–]+$/, '').trim();
  for (const l of labels) {
    if (n === l) return '';
    if (n.startsWith(l + ':') || n.startsWith(l + ' ')) return cell.trim().slice(l.length).replace(/^[\s:–-]+/, '');
  }
  return null;
}

function isNameLike(s: string): boolean {
  const t = s.trim();
  const n = norm(t);
  if (FIELD.test(n)) return false;
  const letters = (t.match(/\p{L}/gu) ?? []).length;
  const digits = (t.match(/\d/g) ?? []).length;
  if (letters < 3 || digits > 2) return false;
  if (/r\$|\*{2,}|•{2,}/i.test(t)) return false;
  if (/^(pix|comprovante|transferencia|pagamento|enviado|realizado|concluido|agendado)\b/.test(n)) return false;
  return true;
}

function cleanName(s: string): string {
  return s.replace(/\s+/g, ' ').replace(/^[\s:–-]+|[\s:–-]+$/g, '').trim();
}

function docDigits(s: string): string | null {
  // CPF mascarado "***.456.789-**", CNPJ "12.345.678/0001-90" ou só números
  if (!/[\d*•]{3}[.\s]?[\d*•]{3}[.\s]?[\d*•]{3}|\d{2}\.\d{3}\.\d{3}\/\d{4}/.test(s)) return null;
  const d = s.replace(/\D/g, '');
  return d.length >= 2 && d.length <= 14 ? d : null;
}

/** Procura o nome e o documento de uma seção (a partir da linha do cabeçalho). */
function sectionPerson(rows: Row[], start: number, stopLabels: string[]): { name: string | null; doc: string | null } {
  let name: string | null = null;
  let doc: string | null = null;

  // "Para: FULANO" / "Para | FULANO" na própria linha do cabeçalho
  const head = rows[start];
  const sameLine = [startsWithLabel(head[0], DEST.concat(ORIGIN)), ...head.slice(1)].filter((x): x is string => !!x && !!x.trim());
  for (const c of sameLine) {
    if (!name && isNameLike(c)) name = cleanName(c);
    if (!doc) doc = docDigits(c);
  }

  for (let i = start + 1; i < Math.min(rows.length, start + 9); i++) {
    const row = rows[i];
    const first = norm(row[0]);
    if (startsWithLabel(row[0], stopLabels) !== null) break;
    const joined = row.join(' ');

    if (!doc && /^(cpf|cnpj|documento)\b/.test(first)) {
      doc = docDigits(joined) ?? (rows[i + 1] ? docDigits(rows[i + 1].join(' ')) : null);
      continue;
    }
    if (!doc) doc = docDigits(joined);

    if (!name && /^nome\b/.test(first)) {
      const rest = [row[0].replace(/^\s*nome\s*:?\s*/i, ''), ...row.slice(1)].filter((x) => x.trim());
      const cand = rest.find(isNameLike) ?? (rows[i + 1] ? rows[i + 1].find(isNameLike) : undefined);
      if (cand) name = cleanName(cand);
      continue;
    }
    if (!name) {
      const cand = row.find(isNameLike);
      if (cand && !FIELD.test(first)) name = cleanName(cand);
    }
    if (name && doc) break;
  }
  return { name, doc };
}

function findRow(rows: Row[], labels: string[]): number {
  return rows.findIndex((r) => startsWithLabel(r[0], labels) !== null);
}

const BANKS: [RegExp, string][] = [
  [/nubank|nu pagamentos/, 'Nubank'],
  [/picpay/, 'PicPay'],
  [/itau/, 'Itaú'],
  [/bradesco/, 'Bradesco'],
  [/santander/, 'Santander'],
  [/caixa tem/, 'Caixa Tem'],
  [/caixa/, 'Caixa'],
  [/banco do brasil|\bbb\b/, 'Banco do Brasil'],
];

export function parsePixReceipt(rows: Row[]): PixReceipt {
  const all = norm(rows.map((r) => r.join(' ')).join('\n'));
  const looksLikePix = /\bpix\b/.test(all);
  const direction: PixDirection = /pix recebido|voce recebeu|recebimento de pix|transferencia recebida/.test(all) ? 'received' : 'sent';

  // valor: linha com rótulo "valor" (não tarifa), ou a próxima; senão o primeiro R$ do comprovante
  let amountCents: number | null = null;
  for (let i = 0; i < rows.length && amountCents === null; i++) {
    const n = norm(rows[i].join(' '));
    if (/\bvalor\b/.test(n) && !/tarifa|taxa|juros|multa|desconto|saldo/.test(n)) {
      amountCents = parseMoneyBR(rows[i].join(' '), true) ?? (rows[i + 1] ? parseMoneyBR(rows[i + 1].join(' '), true) : null);
    }
  }
  if (amountCents === null) {
    for (const r of rows) {
      const n = norm(r.join(' '));
      if (/tarifa|taxa|saldo/.test(n)) continue;
      amountCents = parseMoneyBR(r.join(' '));
      if (amountCents !== null) break;
    }
  }

  // quem é a outra parte
  const sectionLabels = direction === 'sent' ? DEST : ORIGIN;
  const stopLabels = direction === 'sent' ? ORIGIN : DEST;
  const idx = findRow(rows, sectionLabels);
  const person = idx >= 0 ? sectionPerson(rows, idx, stopLabels) : { name: null, doc: null };

  // data e hora: linha com "data"/"quando", senão a primeira data do comprovante
  let date: DateISO | null = null;
  let time: string | null = null;
  const dateRow = rows.findIndex((r) => /^(data|quando|realizad[oa] em|efetuad[oa] em|data da transacao|data e hora)\b/.test(norm(r[0])));
  const dateCandidates = dateRow >= 0 ? [rows[dateRow], rows[dateRow + 1] ?? []].concat(rows) : rows;
  for (const r of dateCandidates) {
    const t = r.join(' ');
    date = date ?? parseDateBR(t);
    time = time ?? (date ? parseTime(t) : null);
    if (date) break;
  }
  if (date && !time) for (const r of rows) if ((time = parseTime(r.join(' ')))) break;

  // ID do Pix: E + 8 dígitos (ISPB) + 12 (data/hora) + 11 caracteres
  const compact = rows.map((r) => r.join('')).join('').replace(/\s/g, '');
  let pixId = compact.match(/E\d{20}[A-Za-z0-9]{11}/)?.[0] ?? null;
  if (!pixId) {
    const idRow = rows.findIndex((r) => /^(id|identificador|id da transacao|id transacao|codigo da transacao|autenticacao|codigo de autenticacao|e2e|end to end)\b/.test(norm(r[0])));
    if (idRow >= 0) {
      const text = [rows[idRow].slice(1).join(''), (rows[idRow + 1] ?? []).join('')].join(' ');
      const inline = rows[idRow][0].replace(/^[^:]*:?/, '');
      pixId = (inline + ' ' + text).replace(/\s/g, ' ').match(/[A-Za-z0-9]{16,}/)?.[0] ?? null;
    }
  }

  const top = norm(rows.slice(0, 4).map((r) => r.join(' ')).join(' '));
  const bank = BANKS.find(([re]) => re.test(top))?.[1] ?? null;

  return {
    amountCents,
    counterpartName: person.name,
    counterpartDoc: person.doc,
    date,
    time,
    pixId,
    direction,
    bank,
    looksLikePix,
  };
}
