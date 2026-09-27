/** Modo gamer: XP, sequência, missões e conquistas. Dados FICTÍCIOS. */
import { describe, expect, it } from 'vitest';

import { activeDays, currentStreak, gameState, levelFor, missionsFor, smallPurchases, xpForLevel, type GameInput } from '../gamification';
import type { Category, Goal, Transaction } from '../types';

/** createdAt no fuso local do dia pedido (meio-dia) */
const at = (date: string, plusDays = 0) => {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(y, m - 1, d + plusDays, 12).toISOString();
};

let n = 0;
function tx(over: Partial<Transaction> & { date: string }): Transaction {
  n++;
  return {
    id: `t${n}`, createdAt: at(over.date), updatedAt: at(over.date), deletedAt: null,
    type: 'expense', description: 'Exemplo', amountCents: 1000, paid: true, categoryId: 'lazer', accountId: 'a',
    notes: '', recurrenceId: null, occurrenceMonth: null, groupId: null, installmentNumber: null, installmentTotal: null,
    cardId: null, invoiceMonth: null, invoicePayment: false, externalId: null, ...over,
  };
}

const lazer = (budgetCents: number | null, updatedAt = '2026-01-01T12:00:00.000Z'): Category => ({
  id: 'lazer', createdAt: '2000-01-01T00:00:00.000Z', updatedAt, deletedAt: null,
  name: 'Lazer', type: 'expense', icon: 'x', color: '#000', archived: false, budgetCents,
});

const goal = (savedCents: number): Goal => ({
  id: 'g', createdAt: '', updatedAt: '', deletedAt: null, name: 'Notebook', targetCents: 10000, savedCents,
  targetDate: null, icon: 'x', color: '#000', archived: false,
});

const input = (over: Partial<GameInput>): GameInput => ({
  transactions: [], recurrences: [], categories: [], goals: [], cards: [], checkins: [], today: '2026-09-27', ...over,
});

describe('dias registrados e sequência', () => {
  it('conta lançamento feito no dia ou no dia seguinte; não conta atrasado, excluído nem extrato', () => {
    const days = activeDays([
      tx({ date: '2026-09-01' }),
      tx({ date: '2026-09-02', createdAt: at('2026-09-02', 1) }), // lançado no dia seguinte: vale (dia 03)
      tx({ date: '2026-08-01', createdAt: at('2026-09-05') }), // lançado um mês depois: não vale
      tx({ date: '2026-09-06', deletedAt: at('2026-09-07') }),
      tx({ date: '2026-09-08', externalId: 'extrato:2026-09-08:1000:x' }),
      tx({ date: '2026-09-09', externalId: 'E0000' }), // comprovante: vale
    ], ['2026-09-10']);
    expect([...days].sort()).toEqual(['2026-09-01', '2026-09-03', '2026-09-09', '2026-09-10']);
  });

  it('sequência termina hoje ou ontem; "Hoje não gastei" mantém', () => {
    const days = activeDays([tx({ date: '2026-09-24' }), tx({ date: '2026-09-25' })], ['2026-09-26']);
    expect(currentStreak(days, '2026-09-27')).toBe(3); // hoje ainda dá tempo
    expect(currentStreak(days, '2026-09-28')).toBe(0);
  });
});

describe('níveis', () => {
  it('cada nível custa 100 a mais que o anterior', () => {
    expect([1, 2, 3, 4, 5].map(xpForLevel)).toEqual([0, 100, 300, 600, 1000]);
    expect(levelFor(0)).toMatchObject({ level: 1, title: 'Novato', into: 0, need: 100 });
    expect(levelFor(650)).toMatchObject({ level: 4, title: 'Aprendiz', into: 50, need: 400 });
    expect(levelFor(1000).title).toBe('Estrategista');
  });
});

describe('XP', () => {
  it('7 dias seguidos: 70 de registro + 50 da sequência; nada por valor gasto', () => {
    const t = Array.from({ length: 7 }, (_, i) => tx({ date: `2026-09-0${i + 1}`, amountCents: 999999 }));
    const g = gameState(input({ transactions: t, today: '2026-09-07' }));
    expect(g.breakdown).toEqual(expect.arrayContaining([
      { label: 'Dias registrados (7)', xp: 70 },
      { label: 'Sequências de 7 dias (1)', xp: 50 },
    ]));
    expect(g.streak).toBe(7);
    expect(g.achievements.find((a) => a.id === 'streak7')?.unlocked).toBe(true);
  });

  it('mês fechado dentro do orçamento e sem atraso dá XP; o mês atual ainda não', () => {
    const t = [tx({ date: '2026-08-05', amountCents: 4000 }), tx({ date: '2026-09-05', amountCents: 4000 })];
    const g = gameState(input({ transactions: t, categories: [lazer(10000)] }));
    const byLabel = Object.fromEntries(g.breakdown.map((l) => [l.label, l.xp]));
    expect(byLabel['Orçamentos fechados dentro do limite (1)']).toBe(50);
    expect(byLabel['Meses com todos os orçamentos no limite (1)']).toBe(100);
    expect(byLabel['Meses sem conta atrasada (1)']).toBe(50);
  });

  it('orçamento estourado ou conta em aberto não dão XP', () => {
    const t = [tx({ date: '2026-08-05', amountCents: 15000 }), tx({ date: '2026-08-06', paid: false })];
    const labels = gameState(input({ transactions: t, categories: [lazer(10000)] })).breakdown.map((l) => l.label);
    expect(labels.some((l) => l.startsWith('Orçamentos'))).toBe(false);
    expect(labels.some((l) => l.startsWith('Meses sem conta'))).toBe(false);
  });

  it('definir orçamento hoje não dá XP de meses passados', () => {
    const t = [tx({ date: '2026-08-05', amountCents: 4000 })];
    const g = gameState(input({ transactions: t, categories: [lazer(10000, at('2026-09-20'))] }));
    expect(g.breakdown.some((l) => l.label.startsWith('Orçamentos'))).toBe(false);
  });

  it('metas: marcos de 25/50/75/100%; retirar faz o XP cair', () => {
    expect(gameState(input({ goals: [goal(5000)] })).breakdown).toEqual([{ label: 'Marcos de metas', xp: 75 }]);
    expect(gameState(input({ goals: [goal(10000)] })).breakdown).toEqual([{ label: 'Marcos de metas', xp: 350 }]);
    expect(gameState(input({ goals: [goal(2000)] })).breakdown).toEqual([]);
  });
});

describe('missões', () => {
  it('registre em 20 dias: vale assim que chega a 20', () => {
    const t = Array.from({ length: 20 }, (_, i) => tx({ date: `2026-09-${String(i + 1).padStart(2, '0')}` }));
    const inp = input({ transactions: t });
    const m = missionsFor('2026-09', inp, activeDays(t, []));
    expect(m[0]).toMatchObject({ kind: 'register', done: true, final: true });
  });

  it('categoria que mais pesou no mês passado: só vale no fim do mês', () => {
    const t = [tx({ date: '2026-08-05', amountCents: 9000 }), tx({ date: '2026-09-05', amountCents: 3000 })];
    const inp = input({ transactions: t, categories: [lazer(10000)] });
    const now = missionsFor('2026-09', inp, activeDays(t, []));
    expect(now[1]).toMatchObject({ kind: 'category', title: 'Feche Lazer abaixo de 80%', done: false, final: false });
    const closed = missionsFor('2026-09', { ...inp, today: '2026-10-01' }, activeDays(t, []));
    expect(closed[1]).toMatchObject({ done: true, final: true });
  });

  it('compras pequenas: 20% a menos que no mês passado (quando foram 5 ou mais)', () => {
    const aug = Array.from({ length: 10 }, (_, i) => tx({ date: `2026-08-${String(i + 1).padStart(2, '0')}`, amountCents: 1500 }));
    const sep = Array.from({ length: 9 }, (_, i) => tx({ date: `2026-09-${String(i + 1).padStart(2, '0')}`, amountCents: 1500 }));
    expect(smallPurchases('2026-08', aug, [])).toBe(10);
    const t = [...aug, ...sep];
    const m = missionsFor('2026-09', input({ transactions: t, today: '2026-10-02' }), activeDays(t, []));
    expect(m.find((x) => x.kind === 'small')).toMatchObject({ title: 'No máximo 8 compras pequenas', done: false });
  });

  it('sem histórico de compras pequenas: pagar as contas em dia', () => {
    const t = [tx({ date: '2026-09-05' })];
    const m = missionsFor('2026-09', input({ transactions: t }), activeDays(t, []));
    expect(m.map((x) => x.kind)).toEqual(['register', 'bills']);
  });
});
