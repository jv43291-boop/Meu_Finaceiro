import { describe, expect, it } from 'vitest';

import { buildDiagnosticReport, maskEmail } from '../diagnosticReport';
import { checkIntegrity } from '../integrity';
import type { Account, Transaction } from '../types';

// FICTÍCIO
const acc: Account = { id: 'acc', name: 'Conta Secreta', kind: 'checking', openingBalanceCents: 0, color: '', archived: false, createdAt: '', updatedAt: '', deletedAt: null };
const tx = (over: Partial<Transaction>): Transaction => ({
  id: 't', type: 'expense', description: 'Remédio caro', amountCents: 12345, date: '2026-09-26', paid: true, categoryId: null, accountId: 'acc', notes: '',
  recurrenceId: null, occurrenceMonth: null, groupId: null, installmentNumber: null, installmentTotal: null, cardId: null, invoiceMonth: null,
  invoicePayment: false, externalId: null, createdAt: '', updatedAt: '', deletedAt: null, ...over,
});
const empty = { accounts: [acc], categories: [], recurrences: [], transactions: [], cards: [], goals: [], payeeRules: [] };

describe('revalidar integridade', () => {
  it('dados coerentes: nenhum problema', () => {
    expect(checkIntegrity({ ...empty, transactions: [tx({})] })).toEqual([]);
  });

  it('acha referências quebradas, duplicados e valores inválidos', () => {
    const issues = checkIntegrity({
      ...empty,
      transactions: [
        tx({ id: 'a', categoryId: 'sumiu' }),
        tx({ id: 'b', accountId: 'sumiu' }),
        tx({ id: 'c', amountCents: 0 }),
        tx({ id: 'd', externalId: 'E1' }), tx({ id: 'e', externalId: 'E1' }),
        tx({ id: 'f', recurrenceId: 'r-apagado', occurrenceMonth: '2026-09' }),
        tx({ id: 'g', invoicePayment: true, cardId: null }),
        tx({ id: 'h', categoryId: 'sumiu', deletedAt: '2026-09-01' }), // excluído: não conta
      ],
    });
    const codes = Object.fromEntries(issues.map((i) => [i.code, i.count]));
    expect(codes).toEqual({ tx_category: 1, tx_account: 1, tx_amount: 1, tx_pix_dup: 1, tx_rule: 1, tx_invoice_payment: 1 });
  });

  it('sem nenhuma conta', () => {
    expect(checkIntegrity({ ...empty, accounts: [] }).map((i) => i.code)).toEqual(['no_account']);
  });
});

describe('diagnóstico exportado', () => {
  it('não leva valor, descrição, nome de conta nem e-mail completo', () => {
    const issues = checkIntegrity({ ...empty, transactions: [tx({ categoryId: 'sumiu' })] });
    const text = buildDiagnosticReport({
      generatedAt: '2026-09-26T20:00:00Z',
      app: { version: '2.0.0', runtime: '2.0.0', channel: 'preview', updateId: 'abcdef123456', embedded: false, platform: 'android' },
      sqlite: { ok: true, check: 'ok', schemaVersion: 5, tables: [{ table: 'transactions', total: 1, deleted: 0, pending: 1 }], quarantined: 0 },
      auth: { configured: true, signedIn: true, email: 'joao.teste@exemplo.com' },
      supabase: { ok: true, ms: 120, status: 200 },
      sync: { status: 'idle', lastSyncAt: '2026-09-26T19:59:00Z', pending: 1, rejected: 0, nextRetryAt: null, clockSkewMs: 1500 },
      issues,
    });
    expect(text).toContain('transactions: 1 registros');
    expect(text).toContain('[tx_category]');
    expect(text).toContain('j***@exemplo.com');
    for (const secret of ['Remédio', '123,45', '12345', 'Conta Secreta', 'joao.teste']) expect(text).not.toContain(secret);
  });
  it('mascara e-mail', () => {
    expect(maskEmail('ana@x.com')).toBe('a***@x.com');
    expect(maskEmail(null)).toBe('—');
  });
});
