/**
 * Regras por recebedor: "Pix para JOSÉ RIBEIRO = Compra de pão, Padaria".
 *
 * Regra de negócio (também descrita na migração 20260928000000_live_pix.sql):
 * - o recebedor é reconhecido pelo nome normalizado; se a regra tem documento
 *   (dígitos visíveis do CPF/CNPJ), o documento do comprovante precisa bater;
 * - com duas regras possíveis, vence a que tem documento; empatou, a alterada
 *   mais recentemente (usar uma regra conta como alteração).
 */
import { norm } from './pixReceipt';
import type { PayeeRule } from './types';

/** "José  Ribeiro-Silva " → "jose ribeiro silva" */
export function normalizeName(name: string): string {
  return norm(name).replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();
}

export function findPayeeRule(rules: PayeeRule[], name: string | null, doc: string | null): PayeeRule | null {
  if (!name) return null;
  const key = normalizeName(name);
  if (!key) return null;
  const candidates = rules.filter((r) => !r.deletedAt && r.matchName === key && (!r.matchDoc || r.matchDoc === doc));
  candidates.sort((a, b) => Number(!!b.matchDoc) - Number(!!a.matchDoc) || (a.updatedAt < b.updatedAt ? 1 : a.updatedAt > b.updatedAt ? -1 : 0));
  return candidates[0] ?? null;
}

/** Cria ou atualiza a regra para este recebedor (mesmo nome + mesmo documento = mesma regra). */
export function upsertPayeeRule(
  rules: PayeeRule[],
  input: { name: string; doc: string | null; description: string; categoryId: string | null; accountId: string | null },
  ctx: { newId: () => string; now: () => string },
): PayeeRule {
  // mesmos limites do servidor (migração 20260928000000_live_pix.sql)
  const matchName = normalizeName(input.name).slice(0, 200);
  const existing = rules.find((r) => !r.deletedAt && r.matchName === matchName && r.matchDoc === (input.doc ?? null));
  const now = ctx.now();
  return {
    id: existing?.id ?? ctx.newId(),
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
    deletedAt: null,
    matchName,
    matchDoc: input.doc && /^[0-9]{2,14}$/.test(input.doc) ? input.doc : null,
    description: input.description.trim().slice(0, 200),
    categoryId: input.categoryId,
    accountId: input.accountId,
  };
}

/** Lançamento com o mesmo ID de Pix que ainda existe (não excluído). */
export function findDuplicatePix<T extends { externalId?: string | null; deletedAt: string | null }>(transactions: T[], pixId: string | null): T | null {
  if (!pixId) return null;
  return transactions.find((t) => !t.deletedAt && t.externalId === pixId) ?? null;
}

export interface HistorySuggestion {
  description: string;
  categoryId: string | null;
  /** quantos Pix anteriores para essa pessoa usaram essa descrição/categoria */
  count: number;
}

/**
 * Sem regra salva: sugere pelo histórico. Os lançamentos feitos pelo comprovante
 * guardam "Pix para NOME" nas observações; o par descrição+categoria mais usado
 * com esse recebedor vira a sugestão (empate: o mais recente). Só sugere — a
 * pessoa confirma na tela de conferência.
 */
export function suggestFromHistory(
  transactions: { notes: string; description: string; categoryId: string | null; date: string; deletedAt: string | null }[],
  name: string | null,
): HistorySuggestion | null {
  if (!name) return null;
  const key = normalizeName(name);
  if (!key) return null;
  const groups = new Map<string, HistorySuggestion & { last: string }>();
  for (const t of transactions) {
    if (t.deletedAt) continue;
    const m = /^Pix (?:para|de) (.+?)(?: · |$)/.exec(t.notes ?? '');
    if (!m || normalizeName(m[1]) !== key) continue;
    const g = `${t.description}\u0000${t.categoryId ?? ''}`;
    const cur = groups.get(g) ?? { description: t.description, categoryId: t.categoryId, count: 0, last: '' };
    cur.count++;
    if (t.date > cur.last) cur.last = t.date;
    groups.set(g, cur);
  }
  const best = [...groups.values()].sort((a, b) => b.count - a.count || (a.last < b.last ? 1 : -1))[0];
  return best ? { description: best.description, categoryId: best.categoryId, count: best.count } : null;
}
