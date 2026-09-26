/**
 * P0 — isolamento entre contas no MESMO aparelho, com o banco e as consultas reais
 * do app (SQLite via sql.js) e um servidor falso que separa os dados por dono
 * (como o RLS + chave (user_id, id) do Supabase). Tudo fictício.
 */
import { beforeEach, describe, expect, it } from 'vitest';

import { openTestDb } from '../../db/__tests__/sqljsDb';
import { applyChanges, loadAll, seedIfEmpty, upsertAccount } from '../../db/repo';
import { countDirty, createLocalStore } from '../../db/syncStore';
import { createEntry, type Ctx } from '../../domain/operations';
import { clearDeviceAfterSignOut, decideSignIn, prepareDeviceForUser } from '../account';
import { SyncError, syncOnce, SYNC_TABLES, type RemoteRow, type RemoteStore, type SyncTable } from '../engine';

const A = 'aaaaaaaa-0000-0000-0000-00000000000a';
const B = 'bbbbbbbb-0000-0000-0000-00000000000b';

/** Servidor com dados separados por dono; vence o updated_at maior (trigger do Supabase). */
class Server {
  rows = new Map<SyncTable, Map<string, RemoteRow & { user_id: string }>>(SYNC_TABLES.map((t) => [t, new Map()]));
  offline = false;
  private serial = 0;
  as(user: string): RemoteStore {
    return {
      upsert: async (table, rows) => {
        if (this.offline) throw new SyncError('fetch failed', 'network');
        for (const r of rows) {
          const key = `${user}|${r.id}`;
          const old = this.rows.get(table)!.get(key);
          if (old && Date.parse(r.updated_at) < Date.parse(old.updated_at)) continue;
          this.rows.get(table)!.set(key, { ...r, user_id: user, server_updated_at: new Date(Date.UTC(2026, 0, 1) + ++this.serial).toISOString() });
        }
      },
      pullSince: async (table, since, limit) => {
        if (this.offline) throw new SyncError('fetch failed', 'network');
        return [...this.rows.get(table)!.values()]
          .filter((r) => r.user_id === user && (!since || r.server_updated_at! > since))
          .sort((x, y) => (x.server_updated_at! < y.server_updated_at! ? -1 : 1))
          .slice(0, limit)
          .map(({ user_id: _u, ...r }) => r as RemoteRow);
      },
    };
  }
  descriptionsOf(user: string): string[] {
    return [...this.rows.get('transactions')!.values()].filter((r) => r.user_id === user).map((r) => String(r.description));
  }
}

let n = 0;
const ids = () => `00000000-0000-4000-8000-${String(++n).padStart(12, '0')}`;
const ctx: Ctx = { newId: ids, now: () => new Date(Date.UTC(2026, 8, 26, 12, 0, n++)).toISOString() };

async function lancar(db: Awaited<ReturnType<typeof openTestDb>>, description: string) {
  const snap = await loadAll(db);
  await applyChanges(db, createEntry(ctx, {
    type: 'expense', description, amountCents: 1000, date: '2026-09-26', paid: true,
    categoryId: null, accountId: snap.accounts[0]?.id ?? null, notes: '',
  }, { kind: 'none' }));
}

const localDescriptions = async (db: Awaited<ReturnType<typeof openTestDb>>) =>
  (await loadAll(db)).transactions.filter((t) => !t.deletedAt).map((t) => t.description);

/** Mesmo fluxo do app: preparar o aparelho e sincronizar. */
async function entrar(db: Awaited<ReturnType<typeof openTestDb>>, server: Server, user: string) {
  const action = await prepareDeviceForUser(db, user, ids);
  if (!server.offline) await syncOnce(createLocalStore(db), server.as(user));
  return action;
}
/** Mesmo fluxo do app: envia o pendente (se der) e apaga o aparelho. */
async function sair(db: Awaited<ReturnType<typeof openTestDb>>, server: Server, user: string, opts: { force?: boolean } = {}) {
  if (!server.offline) await syncOnce(createLocalStore(db), server.as(user));
  const pending = await countDirty(db);
  if (pending > 0 && !opts.force) return { done: false as const, pending };
  await clearDeviceAfterSignOut(db, ids);
  return { done: true as const };
}

describe('decisão ao entrar', () => {
  it('celular sem dono adota, mesmo dono continua, outro dono apaga', () => {
    expect(decideSignIn(null, A)).toBe('adopt-local');
    expect(decideSignIn(A, A)).toBe('continue');
    expect(decideSignIn(A, B)).toBe('wipe-other');
  });
});

describe('P0: A e B no mesmo celular', () => {
  let db: Awaited<ReturnType<typeof openTestDb>>;
  let server: Server;
  beforeEach(async () => {
    db = await openTestDb();
    await seedIfEmpty(db, ids);
    server = new Server();
  });

  it('dados de A não aparecem para B nem sobem para a conta de B; A volta e recupera tudo', async () => {
    await entrar(db, server, A);
    await lancar(db, 'Mercado do A');
    await syncOnce(createLocalStore(db), server.as(A));
    expect(server.descriptionsOf(A)).toEqual(['Mercado do A']);

    expect((await sair(db, server, A)).done).toBe(true);
    expect(await localDescriptions(db)).toEqual([]); // nada de A no aparelho

    await entrar(db, server, B);
    expect(await localDescriptions(db)).toEqual([]); // B não vê A
    expect(server.descriptionsOf(B)).toEqual([]); // nada de A subiu para B
    await lancar(db, 'Farmácia do B');
    await syncOnce(createLocalStore(db), server.as(B));
    expect(server.descriptionsOf(A)).toEqual(['Mercado do A']); // conta de A intacta

    await sair(db, server, B);
    await entrar(db, server, A);
    expect(await localDescriptions(db)).toEqual(['Mercado do A']); // A recupera; nada de B
  });

  it('entrar e sair várias vezes não vaza nem duplica', async () => {
    await entrar(db, server, A);
    await lancar(db, 'Aluguel do A');
    for (let i = 0; i < 3; i++) {
      await sair(db, server, A);
      await entrar(db, server, B);
      await sair(db, server, B);
      await entrar(db, server, A);
    }
    expect(await localDescriptions(db)).toEqual(['Aluguel do A']);
    expect(server.descriptionsOf(A)).toEqual(['Aluguel do A']);
    expect(server.descriptionsOf(B)).toEqual([]);
    expect(await countDirty(db)).toBe(0);
  });

  it('sem internet: sair avisa das pendências; forçar não leva os dados de A para B', async () => {
    await entrar(db, server, A);
    server.offline = true;
    await lancar(db, 'Padaria do A (offline)');
    const r = await sair(db, server, A);
    expect(r).toEqual({ done: false, pending: expect.any(Number) });
    expect(await localDescriptions(db)).toEqual(['Padaria do A (offline)']); // nada apagado sem confirmação
    await sair(db, server, A, { force: true });
    server.offline = false;
    await entrar(db, server, B);
    expect(await localDescriptions(db)).toEqual([]);
    expect(server.descriptionsOf(B)).toEqual([]);
  });

  it('versão antiga que não apagava ao sair: B entrando apaga os dados de A antes de sincronizar', async () => {
    await entrar(db, server, A);
    await lancar(db, 'Salário do A');
    await syncOnce(createLocalStore(db), server.as(A));
    // simula o app antigo: saiu sem apagar (o celular continua marcado como de A)
    expect(await entrar(db, server, B)).toBe('wipe-other');
    expect(await localDescriptions(db)).toEqual([]);
    expect(server.descriptionsOf(B)).toEqual([]);
  });

  it('dados criados sem conta sobem para a primeira conta que entrar', async () => {
    await lancar(db, 'Feito antes de ter conta');
    expect(await entrar(db, server, A)).toBe('adopt-local');
    expect(server.descriptionsOf(A)).toEqual(['Feito antes de ter conta']);
  });

  it('a Carteira renomeada por A não é sobrescrita pela padrão ao voltar', async () => {
    await entrar(db, server, A);
    const acc = (await loadAll(db)).accounts[0];
    await upsertAccount(db, { ...acc, name: 'Nubank do A', updatedAt: ctx.now() });
    await syncOnce(createLocalStore(db), server.as(A));
    await sair(db, server, A);
    await entrar(db, server, A);
    expect((await loadAll(db)).accounts.map((a) => a.name)).toEqual(['Nubank do A']);
  });
});
