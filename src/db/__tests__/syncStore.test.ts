import { describe, expect, it } from 'vitest';

import { upsertPayeeRule } from '../repo';
import { countDirty, createLocalStore, discardLocal, listRejected, retryRejected } from '../syncStore';
import { openTestDb } from './sqljsDb';

const rule = (id: string, description: string, updatedAt = '2026-09-26T10:00:00.000Z') => ({
  id, matchName: 'jose ribeiro', matchDoc: null, description, categoryId: null, accountId: null,
  createdAt: updatedAt, updatedAt, deletedAt: null,
});

describe('fila local (SQL real)', () => {
  it('recusado sai da fila até tentar de novo, e continua pendente', async () => {
    const db = await openTestDb();
    const store = createLocalStore(db);
    await upsertPayeeRule(db, rule('r1', 'x'.repeat(250)));
    await upsertPayeeRule(db, rule('r2', 'Compra de pão'));
    expect((await store.dirty('payee_rules', 10)).map((r) => r.id).sort()).toEqual(['r1', 'r2']);

    await store.quarantine!('payee_rules', [{ id: 'r1', updated_at: '2026-09-26T10:00:00.000Z' }], 'violates check constraint');
    expect((await store.dirty('payee_rules', 10)).map((r) => r.id)).toEqual(['r2']);
    expect(await countDirty(db)).toBe(2); // o recusado ainda conta como pendente
    const rejected = await listRejected(db);
    expect(rejected).toMatchObject([{ table: 'payee_rules', id: 'r1', attempts: 1 }]);

    await retryRejected(db, 'payee_rules', 'r1');
    expect((await store.dirty('payee_rules', 10)).map((r) => r.id).sort()).toEqual(['r1', 'r2']);
  });

  it('editar o recusado faz ele voltar para a fila na hora', async () => {
    const db = await openTestDb();
    const store = createLocalStore(db);
    await upsertPayeeRule(db, rule('r1', 'x'.repeat(250)));
    await store.quarantine!('payee_rules', [{ id: 'r1', updated_at: '2026-09-26T10:00:00.000Z' }], 'violates check constraint');
    await upsertPayeeRule(db, rule('r1', 'Corrigido', '2026-09-26T11:00:00.000Z'));
    expect((await store.dirty('payee_rules', 10)).map((r) => r.id)).toEqual(['r1']);
  });

  it('descartar volta para a versão da nuvem, ou apaga se nunca chegou lá', async () => {
    const db = await openTestDb();
    const store = createLocalStore(db);
    await upsertPayeeRule(db, rule('r1', 'Minha edição recusada', '2026-09-26T11:00:00.000Z'));
    await upsertPayeeRule(db, rule('r2', 'Nunca subiu'));
    await store.quarantine!('payee_rules', [{ id: 'r1', updated_at: '2026-09-26T11:00:00.000Z' }, { id: 'r2', updated_at: '2026-09-26T10:00:00.000Z' }], 'x');

    await discardLocal(db, 'payee_rules', 'r1', {
      id: 'r1', updated_at: '2026-09-26T09:00:00.000Z', match_name: 'jose ribeiro', match_doc: null, description: 'Versão da nuvem',
      category_id: null, account_id: null, created_at: '2026-09-26T09:00:00.000Z', deleted_at: null,
    });
    await discardLocal(db, 'payee_rules', 'r2', null);

    const rows = await db.getAllAsync<{ id: string; description: string; dirty: number }>('SELECT id, description, dirty FROM payee_rules');
    expect(rows).toEqual([{ id: 'r1', description: 'Versão da nuvem', dirty: 0 }]);
    expect(await listRejected(db)).toEqual([]);
  });

  it('quando sobe, sai da quarentena', async () => {
    const db = await openTestDb();
    const store = createLocalStore(db);
    await upsertPayeeRule(db, rule('r1', 'ok'));
    await store.quarantine!('payee_rules', [{ id: 'r1', updated_at: '2026-09-26T10:00:00.000Z' }], 'x');
    await store.markClean('payee_rules', [{ id: 'r1', updated_at: '2026-09-26T10:00:00.000Z' }]);
    await store.release!('payee_rules', ['r1']);
    expect(await listRejected(db)).toEqual([]);
    expect(await countDirty(db)).toBe(0);
  });
});
