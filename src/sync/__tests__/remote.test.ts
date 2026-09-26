import { describe, expect, it } from 'vitest';

import { createRemoteStore } from '../remote';

/** Supabase de mentira: registra cada upsert e responde como o banco antigo ou o novo. */
function fakeClient(schema: 'antigo' | 'novo') {
  const calls: { table: string; onConflict: string; rows: Record<string, unknown>[] }[] = [];
  const client = {
    from(table: string) {
      return {
        async upsert(rows: Record<string, unknown>[], opts: { onConflict: string }) {
          calls.push({ table, onConflict: opts.onConflict, rows });
          const ok = schema === 'novo' ? opts.onConflict === 'user_id,id' : opts.onConflict === 'id';
          return { error: ok ? null : { message: 'there is no unique or exclusion constraint matching the ON CONFLICT specification' } };
        },
      };
    },
  };
  return { client: client as never, calls };
}

const row = { id: 'x', updated_at: '2026-09-26T00:00:00Z' };

describe('envio para o Supabase', () => {
  it('manda o dono em cada linha e usa a chave (user_id, id)', async () => {
    const { client, calls } = fakeClient('novo');
    await createRemoteStore(client, 'usuario-b').upsert('accounts', [row]);
    expect(calls).toHaveLength(1);
    expect(calls[0].onConflict).toBe('user_id,id');
    expect(calls[0].rows[0].user_id).toBe('usuario-b');
  });

  it('banco ainda sem a migração: volta para a chave antiga e continua funcionando', async () => {
    const { client, calls } = fakeClient('antigo');
    const store = createRemoteStore(client, 'usuario-a');
    await store.upsert('accounts', [row]);
    await store.upsert('categories', [row]);
    expect(calls.map((c) => c.onConflict)).toEqual(['user_id,id', 'id', 'id']);
  });

  it('migração rodou com o app aberto: volta para a chave nova sozinho', async () => {
    const { client, calls } = fakeClient('novo');
    await createRemoteStore(client, 'usuario-a').upsert('accounts', [row]); // estava em 'id' pelo teste anterior
    expect(calls.map((c) => c.onConflict)).toEqual(['id', 'user_id,id']);
  });
});
