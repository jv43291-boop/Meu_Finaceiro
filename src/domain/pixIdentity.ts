/**
 * Quem é "você" nos comprovantes de Pix.
 *
 * Todo comprovante tem dois lados (quem pagou e quem recebeu), mas muitos bancos
 * não escrevem "enviado" ou "recebido". Para saber se foi gasto ou receita, o app
 * aprende o seu nome e os dígitos visíveis do seu CPF a partir dos comprovantes
 * que você confirmou ("Paguei" → você é quem pagou; "Recebi" → você é quem recebeu).
 *
 * Fica só no aparelho (tabela meta) e é apagado ao sair da conta.
 */
import { normalizeName } from './payeeRules';

export interface Party {
  name: string | null;
  doc: string | null;
}

export interface OwnIdentity {
  names: string[];
  docs: string[];
}

export const EMPTY_IDENTITY: OwnIdentity = { names: [], docs: [] };
const MAX = 8;

const CONNECTORS = new Set(['da', 'de', 'do', 'das', 'dos', 'e']);
function tokens(name: string): string[] {
  return normalizeName(name).split(' ').filter((t) => t && !CONNECTORS.has(t));
}

/**
 * Mesmo nome, tolerando abreviação do meio ("Carlos T Exemplo" = "Carlos Teste Exemplo"):
 * primeiro e último nome iguais, e cada nome do meio bate por inteiro ou pela inicial.
 */
export function sameName(a: string, b: string): boolean {
  const x = tokens(a);
  const y = tokens(b);
  if (!x.length || !y.length) return false;
  if (x.join(' ') === y.join(' ')) return true;
  if (x.length < 2 || y.length < 2) return false;
  if (x[0] !== y[0] || x[x.length - 1] !== y[y.length - 1]) return false;
  const [short, long] = x.length <= y.length ? [x, y] : [y, x];
  let j = 1;
  for (const t of short.slice(1, -1)) {
    while (j < long.length - 1 && !(long[j] === t || (t.length === 1 && long[j].startsWith(t)) || (long[j].length === 1 && t.startsWith(long[j])))) j++;
    if (j >= long.length - 1) return false;
    j++;
  }
  return true;
}

/** Este lado do comprovante é você? */
export function isMe(me: OwnIdentity, p: Party): boolean {
  if (p.doc && me.docs.includes(p.doc)) return true;
  return !!p.name && me.names.some((n) => sameName(n, p.name!));
}

/** Guarda o lado que você confirmou ser seu (o mais recente primeiro, no máximo 8 de cada). */
export function learnIdentity(me: OwnIdentity, p: Party): OwnIdentity {
  const name = p.name?.trim().slice(0, 120) || null;
  const doc = p.doc && /^\d{2,14}$/.test(p.doc) ? p.doc : null;
  const names = name ? [name, ...me.names.filter((n) => normalizeName(n) !== normalizeName(name))].slice(0, MAX) : me.names;
  const docs = doc ? [doc, ...me.docs.filter((d) => d !== doc)].slice(0, MAX) : me.docs;
  return { names, docs };
}

export function parseIdentity(raw: string | null): OwnIdentity {
  if (!raw) return EMPTY_IDENTITY;
  try {
    const v = JSON.parse(raw) as Partial<OwnIdentity>;
    const strs = (a: unknown) => (Array.isArray(a) ? a.filter((x): x is string => typeof x === 'string').slice(0, MAX) : []);
    return { names: strs(v.names), docs: strs(v.docs) };
  } catch {
    return EMPTY_IDENTITY;
  }
}
