import { describe, expect, it } from 'vitest';
import { formatPlain, parseMoney } from '../money';
import { dateForDay, parseDateBR, shiftMonth } from '../dates';
import { createEntry, deleteItem, editItem, togglePaid, type Changes, type Ctx, type State } from '../operations';
import { itemsForMonth } from '../recurrence';
import { overview, summarizeItems } from '../summary';
import { importLegacy, isSaneRule, parseLegacy } from '../legacyImport';
import type { Account, Category } from '../types';

function ctx(): Ctx {
  let n = 0;
  return { newId: () => `id${++n}`, now: () => '2026-09-25T12:00:00.000Z' };
}
function apply(s: State, c: Changes): State {
  const tx = new Map(s.transactions.map((t) => [t.id, t]));
  for (const t of c.transactions) tx.set(t.id, t);
  const rs = new Map(s.recurrences.map((r) => [r.id, r]));
  for (const r of c.recurrences) rs.set(r.id, r);
  return { transactions: [...tx.values()], recurrences: [...rs.values()] };
}
const input = (over = {}) => ({
  type: 'expense' as const, description: 'Aluguel', amountCents: 80000, date: '2026-09-10',
  paid: false, categoryId: null, accountId: 'acc', notes: '', ...over,
});

describe('dinheiro', () => {
  it('interpreta formatos brasileiros', () => {
    expect(parseMoney('1.621,50')).toBe(162150);
    expect(parseMoney('1621')).toBe(162100);
    expect(parseMoney('1621,5')).toBe(162150);
    expect(parseMoney('1621.50')).toBe(162150);
    expect(parseMoney('1.000')).toBe(100000);
    expect(parseMoney('R$ 115,00')).toBe(11500);
    expect(parseMoney('0,1')).toBe(10);
    expect(parseMoney('')).toBeNull();
    expect(parseMoney('abc')).toBeNull();
    expect(parseMoney('1,234')).toBeNull();
    expect(formatPlain(162150)).toBe('1.621,50');
  });
});

describe('datas', () => {
  it('ajusta dia ao tamanho do mês', () => {
    expect(dateForDay('2027-02', 31)).toBe('2027-02-28');
    expect(shiftMonth('2026-12', 1)).toBe('2027-01');
    expect(shiftMonth('2026-01', -1)).toBe('2025-12');
    expect(parseDateBR('31/02/2026', 2026)).toBeNull();
    expect(parseDateBR('5/9', 2026)).toBe('2026-09-05');
  });
});

describe('recorrência', () => {
  it('projeta meses futuros sem gravar nada', () => {
    const c = ctx();
    let s: State = { transactions: [], recurrences: [] };
    s = apply(s, createEntry(c, input({ type: 'income', description: 'Salário', amountCents: 162100, date: '2026-08-05', paid: true }), { kind: 'monthly', months: null }));
    expect(s.recurrences).toHaveLength(1);
    expect(s.transactions).toHaveLength(1);
    const dez = itemsForMonth('2026-12', s.transactions, s.recurrences);
    expect(dez).toHaveLength(1);
    expect(dez[0].virtual).toBe(true);
    expect(dez[0].date).toBe('2026-12-05');
    const ago = itemsForMonth('2026-08', s.transactions, s.recurrences);
    expect(ago).toHaveLength(1);
    expect(ago[0].virtual).toBe(false);
  });

  it('respeita data de fim', () => {
    const c = ctx();
    const s = apply({ transactions: [], recurrences: [] }, createEntry(c, input({ date: '2026-08-05' }), { kind: 'monthly', months: 12 }));
    expect(s.recurrences[0].endMonth).toBe('2027-07');
    expect(itemsForMonth('2027-07', s.transactions, s.recurrences)).toHaveLength(1);
    expect(itemsForMonth('2027-08', s.transactions, s.recurrences)).toHaveLength(0);
  });

  it('marcar como pago materializa a ocorrência', () => {
    const c = ctx();
    let s = apply({ transactions: [], recurrences: [] }, createEntry(c, input(), { kind: 'monthly', months: null }));
    const [out] = itemsForMonth('2026-10', s.transactions, s.recurrences);
    s = apply(s, togglePaid(c, s, out));
    const [after] = itemsForMonth('2026-10', s.transactions, s.recurrences);
    expect(after.virtual).toBe(false);
    expect(after.paid).toBe(true);
  });

  it('editar "só este" não altera os outros meses', () => {
    const c = ctx();
    let s = apply({ transactions: [], recurrences: [] }, createEntry(c, input(), { kind: 'monthly', months: null }));
    const [out] = itemsForMonth('2026-10', s.transactions, s.recurrences);
    s = apply(s, editItem(c, s, out, { amountCents: 90000 }, 'this'));
    expect(itemsForMonth('2026-10', s.transactions, s.recurrences)[0].amountCents).toBe(90000);
    expect(itemsForMonth('2026-11', s.transactions, s.recurrences)[0].amountCents).toBe(80000);
    expect(itemsForMonth('2026-10', s.transactions, s.recurrences)).toHaveLength(1);
  });

  it('editar "este e os próximos" divide a regra sem duplicar', () => {
    const c = ctx();
    let s = apply({ transactions: [], recurrences: [] }, createEntry(c, input(), { kind: 'monthly', months: null }));
    const [nov] = itemsForMonth('2026-11', s.transactions, s.recurrences);
    s = apply(s, togglePaid(c, s, itemsForMonth('2026-12', s.transactions, s.recurrences)[0]));
    s = apply(s, editItem(c, s, nov, { amountCents: 95000 }, 'future'));
    expect(itemsForMonth('2026-10', s.transactions, s.recurrences).map((i) => i.amountCents)).toEqual([80000]);
    expect(itemsForMonth('2026-11', s.transactions, s.recurrences).map((i) => i.amountCents)).toEqual([95000]);
    // dezembro já estava pago: mantém o valor pago, mas não duplica
    expect(itemsForMonth('2026-12', s.transactions, s.recurrences)).toHaveLength(1);
    expect(itemsForMonth('2027-03', s.transactions, s.recurrences).map((i) => i.amountCents)).toEqual([95000]);
  });

  it('excluir "só este" pula o mês', () => {
    const c = ctx();
    let s = apply({ transactions: [], recurrences: [] }, createEntry(c, input(), { kind: 'monthly', months: null }));
    const [out] = itemsForMonth('2026-10', s.transactions, s.recurrences);
    s = apply(s, deleteItem(c, s, out, 'this'));
    expect(itemsForMonth('2026-10', s.transactions, s.recurrences)).toHaveLength(0);
    expect(itemsForMonth('2026-11', s.transactions, s.recurrences)).toHaveLength(1);
  });

  it('excluir "este e os próximos" encerra a regra e mantém o histórico pago', () => {
    const c = ctx();
    let s = apply({ transactions: [], recurrences: [] }, createEntry(c, input({ paid: true }), { kind: 'monthly', months: null }));
    const [nov] = itemsForMonth('2026-11', s.transactions, s.recurrences);
    s = apply(s, deleteItem(c, s, nov, 'future'));
    expect(itemsForMonth('2026-09', s.transactions, s.recurrences)).toHaveLength(1);
    expect(itemsForMonth('2026-10', s.transactions, s.recurrences)).toHaveLength(1);
    expect(itemsForMonth('2026-11', s.transactions, s.recurrences)).toHaveLength(0);
  });
});

describe('parcelas', () => {
  it('cria N parcelas em meses seguidos', () => {
    const c = ctx();
    const s = apply({ transactions: [], recurrences: [] }, createEntry(c, input({ date: '2026-01-31', paid: true }), { kind: 'installments', total: 3 }));
    expect(s.transactions.map((t) => [t.date, t.installmentNumber, t.paid])).toEqual([
      ['2026-01-31', 1, true], ['2026-02-28', 2, false], ['2026-03-31', 3, false],
    ]);
  });
});

describe('visão geral', () => {
  const acc: Account = { id: 'acc', createdAt: '', updatedAt: '', deletedAt: null, name: 'Carteira', kind: 'cash', openingBalanceCents: 0, color: '', archived: false };
  it('conta atrasados e previsto do mês', () => {
    const c = ctx();
    let s: State = { transactions: [], recurrences: [] };
    s = apply(s, createEntry(c, input({ type: 'income', description: 'Salário', amountCents: 162100, date: '2026-08-05', paid: true }), { kind: 'monthly', months: null }));
    s = apply(s, createEntry(c, input({ description: 'Curso', amountCents: 11500, date: '2026-08-05', paid: true }), { kind: 'monthly', months: 12 }));
    const o = overview([acc], s.transactions, s.recurrences, { today: '2026-09-25' });
    expect(o.balance).toBe(162100 - 11500);
    // setembro: salário e curso ainda não marcados -> atrasados
    expect(o.overdue).toHaveLength(2);
    expect(o.forecast).toBe(162100 - 11500 + 162100 - 11500);
    const sum = summarizeItems(itemsForMonth('2026-09', s.transactions, s.recurrences));
    expect(sum.result).toBe(162100 - 11500);
  });
});

describe('importação do app antigo', () => {
  // dados fictícios no mesmo formato do app antigo
  const legacy = {
    budgets: [], version: 2, closedMonths: [],
    entries: [
      ...Array.from({ length: 12 }, (_, i) => {
        const m = shiftMonth('2026-08', i);
        return { id: `c${i}`, type: 'expense', value: 115, month: m, dueDate: `${m}-05`, paid: i === 0, recurring: true, category: 'Educação', description: 'Curso X.', groupId: 'g1', notes: '' };
      }),
      { id: 's', type: 'income', value: 1621, month: '2026-08', dueDate: '2026-08-05', paid: true, recurring: true, category: 'Salário', description: 'Salário mensal' },
      { id: 'a', type: 'expense', value: 49.9, month: '2026-08', dueDate: '2026-08-20', paid: false, category: 'Categoria Nova', description: 'Avulso' },
      { id: 'bad', type: 'x', value: 'y' },
    ],
  };
  const cats: Category[] = [
    { id: 'edu', createdAt: '', updatedAt: '', deletedAt: null, name: 'Educação', type: 'expense', icon: '', color: '', archived: false },
    { id: 'sal', createdAt: '', updatedAt: '', deletedAt: null, name: 'Salário', type: 'income', icon: '', color: '', archived: false },
  ];

  it('converte grupos e recorrentes em regras', () => {
    const r = importLegacy(ctx(), parseLegacy({ payload: legacy }), cats, 'acc');
    expect(r.stats.skipped).toBe(1);
    expect(r.recurrences).toHaveLength(2);
    expect(r.recurrences.every(isSaneRule)).toBe(true);
    const curso = r.recurrences.find((x) => x.description === 'Curso X')!;
    expect([curso.startMonth, curso.endMonth, curso.amountCents, curso.categoryId]).toEqual(['2026-08', '2027-07', 11500, 'edu']);
    const sal = r.recurrences.find((x) => x.description === 'Salário mensal')!;
    expect(sal.endMonth).toBeNull();
    expect(r.newCategories.map((c) => c.name)).toEqual(['Categoria Nova']);
    expect(r.transactions.find((t) => t.description === 'Avulso')!.amountCents).toBe(4990);
    const s = { transactions: r.transactions, recurrences: r.recurrences };
    expect(itemsForMonth('2026-08', s.transactions, s.recurrences)).toHaveLength(3);
    expect(itemsForMonth('2027-03', s.transactions, s.recurrences).map((i) => i.description).sort()).toEqual(['Curso X', 'Salário mensal']);
    expect(itemsForMonth('2027-08', s.transactions, s.recurrences).map((i) => i.description)).toEqual(['Salário mensal']);
  });
});
