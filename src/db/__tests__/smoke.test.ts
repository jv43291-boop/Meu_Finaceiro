import { describe, expect, it } from 'vitest';

import { loadAll, seedIfEmpty } from '../repo';
import { openTestDb } from './sqljsDb';

describe('banco de teste', () => {
  it('aplica as migrações e cria os itens padrão', async () => {
    const db = await openTestDb();
    const v = await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version');
    expect(v?.user_version).toBe(5);
    await seedIfEmpty(db, () => 'x');
    const snap = await loadAll(db);
    expect(snap.accounts).toHaveLength(1);
    expect(snap.categories.length).toBeGreaterThan(5);
  });
});

describe('saúde do SQLite', () => {
  it('integrity_check ok e contagens por tabela', async () => {
    const { sqliteHealth } = await import('../diagnostics');
    const db = await openTestDb();
    await seedIfEmpty(db, () => 'x');
    const h = await sqliteHealth(db);
    expect(h).toMatchObject({ ok: true, check: 'ok', schemaVersion: 5, quarantined: 0 });
    expect(h.tables.find((t) => t.table === 'accounts')).toEqual({ table: 'accounts', total: 1, deleted: 0, pending: 1 });
  });
});
