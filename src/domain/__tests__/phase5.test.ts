import { describe, expect, it } from 'vitest';

import { buildCsv, csvCell, csvNumber, type ExportInput } from '../exportCsv';
import { createEntry, type Changes, type Ctx, type State } from '../operations';
import { parseReminderSettings, planReminders, type ReminderSettings } from '../reminders';
import type { Account, Category, CreditCard } from '../types';

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
const card: CreditCard = { id: 'nu', createdAt: '', updatedAt: '', deletedAt: null, name: 'Cartão Teste', limitCents: 0, closingDay: 3, dueDay: 10, accountId: 'acc', color: '', archived: false };
const acc: Account = { id: 'acc', createdAt: '', updatedAt: '', deletedAt: null, name: 'Conta Teste', kind: 'checking', openingBalanceCents: 0, color: '', archived: false };
const cat: Category = { id: 'casa', name: 'Casa', type: 'expense', icon: '', color: '', archived: false, budgetCents: null, createdAt: '', updatedAt: '', deletedAt: null };
const exp = (over = {}) => ({ type: 'expense' as const, description: 'Aluguel', amountCents: 100000, date: '2026-09-28', paid: false, categoryId: 'casa', accountId: 'acc', notes: '', ...over });
const on: ReminderSettings = { enabled: true, daysBefore: 1, hour: 9, showAmounts: true };
// 25/09/2026 10:00 no horário local
const now = new Date(2026, 8, 25, 10, 0, 0);

function sample(): State {
  const k = ctx();
  let s: State = { transactions: [], recurrences: [] };
  s = apply(s, createEntry(k, exp(), { kind: 'none' }));
  s = apply(s, createEntry(k, exp({ description: 'Luz', amountCents: 15000 }), { kind: 'none' }));
  s = apply(s, createEntry(k, exp({ description: 'Pago já', date: '2026-09-27', paid: true }), { kind: 'none' }));
  s = apply(s, createEntry(k, exp({ description: 'Internet', amountCents: 9990, date: '2026-09-05' }), { kind: 'monthly', months: null }));
  s = apply(s, createEntry(k, exp({ description: 'Salário', type: 'income', date: '2026-09-30' }), { kind: 'none' }));
  s = apply(s, createEntry(k, exp({ description: 'Mercado', amountCents: 20000, date: '2026-09-15', cardId: 'nu' }), { kind: 'none' }));
  return s;
}

describe('lembretes de vencimento', () => {
  it('desligado não agenda nada', () => {
    expect(planReminders({ ...sample(), cards: [card] }, { ...on, enabled: false }, now)).toEqual([]);
  });

  it('agrupa por dia, ignora pagos, receitas e compras no cartão; avisa a fatura', () => {
    const plan = planReminders({ ...sample(), cards: [card] }, on, now);
    const d28 = plan.find((p) => p.dueDate === '2026-09-28')!;
    expect(d28.count).toBe(2);
    expect(d28.title).toBe('2 contas vencem amanhã');
    expect(d28.body).toContain('Aluguel e Luz');
    expect(d28.fireAt).toEqual(new Date(2026, 8, 27, 9, 0, 0));
    expect(plan.some((p) => p.dueDate === '2026-09-27')).toBe(false); // estava pago
    expect(plan.some((p) => p.dueDate === '2026-09-30')).toBe(false); // receita
    expect(plan.some((p) => p.dueDate === '2026-09-15')).toBe(false); // compra no cartão
    // a compra do dia 15 cai na fatura que vence 10/10; a internet recorrente vence 05/10
    expect(plan.find((p) => p.dueDate === '2026-10-10')?.title).toBe('Vence amanhã: Fatura Cartão Teste');
    expect(plan.find((p) => p.dueDate === '2026-10-05')?.title).toBe('Vence amanhã: Internet');
  });

  it('não agenda aviso cujo horário já passou e respeita o limite', () => {
    const k = ctx();
    let s: State = { transactions: [], recurrences: [] };
    s = apply(s, createEntry(k, exp({ date: '2026-09-26' }), { kind: 'none' }));
    const plan = planReminders({ ...s, cards: [] }, { ...on, hour: 8 }, now); // 25/09 8h já passou
    expect(plan).toEqual([]);
    const sameDay = planReminders({ ...s, cards: [] }, { ...on, daysBefore: 0, hour: 8 }, now);
    expect(sameDay).toHaveLength(1);
    expect(planReminders({ ...sample(), cards: [card] }, on, now, { max: 1 })).toHaveLength(1);
  });

  it('sem valor por padrão (tela bloqueada)', () => {
    const plan = planReminders({ ...sample(), cards: [card] }, { ...on, showAmounts: false }, now);
    expect(plan.every((p) => !p.body.includes('R$'))).toBe(true);
  });

  it('lê configuração salva com segurança', () => {
    expect(parseReminderSettings(null).enabled).toBe(false);
    expect(parseReminderSettings('lixo').hour).toBe(9);
    expect(parseReminderSettings('{"enabled":true,"daysBefore":9,"hour":-2}')).toEqual({ enabled: true, daysBefore: 3, hour: 0, showAmounts: false });
  });
});

describe('exportar CSV', () => {
  const input = (over: Partial<ExportInput> = {}): ExportInput => ({
    from: '2026-09-01', to: '2026-09-30', ...sample(), categories: [cat], accounts: [acc], cards: [card], includeForecast: true, ...over,
  });

  it('formata número e célula no padrão brasileiro', () => {
    expect(csvNumber(123456)).toBe('1234,56');
    expect(csvNumber(-5)).toBe('-0,05');
    expect(csvCell('a;b')).toBe('"a;b"');
    expect(csvCell('diz "oi"')).toBe('"diz ""oi"""');
    expect(csvCell('=HYPERLINK(1)')).toBe("'=HYPERLINK(1)");
  });

  it('gera cabeçalho, BOM e linhas do período', () => {
    const csv = buildCsv(input());
    expect(csv.startsWith('﻿Data;Descrição;Tipo;Valor')).toBe(true);
    const lines = csv.trim().split('\r\n');
    expect(lines).toHaveLength(1 + 6);
    expect(lines).toContain('28/09/2026;Aluguel;Despesa;-1000,00;Pendente;Casa;Conta Teste;;;;');
    expect(lines).toContain('30/09/2026;Salário;Receita;1000,00;Pendente;Casa;Conta Teste;;;;');
    expect(lines).toContain('15/09/2026;Mercado;Despesa no cartão;-200,00;Na fatura;Casa;;Cartão Teste;out/26;;');
  });

  it('previstos saem só quando pedido', () => {
    const k = ctx();
    let s: State = { transactions: [], recurrences: [] };
    s = apply(s, createEntry(k, exp({ description: 'Academia', date: '2026-08-10' }), { kind: 'monthly', months: null }));
    const withF = buildCsv(input({ ...s, includeForecast: true }));
    expect(withF).toContain('10/09/2026;Academia;Despesa;-1000,00;Previsto');
    expect(buildCsv(input({ ...s, includeForecast: false }))).not.toContain('Academia');
  });
});
