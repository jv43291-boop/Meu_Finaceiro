/**
 * Ponta "servidor" do sync, falando com o Supabase. Separado de supabase.ts
 * (que carrega módulos nativos) para poder ser testado.
 */
import type { SupabaseClient } from '@supabase/supabase-js';

import type { RemoteRow, RemoteStore, SyncTable } from './engine';

/**
 * Chave de conflito no servidor. Depois da migração 20260929000000_live_isolamento
 * é (user_id, id): o mesmo id (conta e categorias padrão) existe uma vez por pessoa.
 * Antes dela, só "id". O app tenta a nova e, se o banco ainda não tiver, volta para a antiga.
 */
let conflictKey: 'user_id,id' | 'id' = 'user_id,id';

export function createRemoteStore(client: SupabaseClient, userId: string): RemoteStore {
  return {
    async upsert(table: SyncTable, rows: RemoteRow[]) {
      // o dono vai explícito; o RLS recusa qualquer user_id que não seja o de quem entrou
      const owned = rows.map((r) => ({ ...r, user_id: userId }));
      let { error } = await client.from(table).upsert(owned, { onConflict: conflictKey });
      if (error && /no unique or exclusion constraint/i.test(error.message)) {
        // o banco está no outro formato (migração rodou ou ainda não): troca e tenta de novo
        conflictKey = conflictKey === 'user_id,id' ? 'id' : 'user_id,id';
        ({ error } = await client.from(table).upsert(owned, { onConflict: conflictKey }));
      }
      if (error) throw new Error(`Falha ao enviar ${table}: ${error.message}`);
    },
    async pullSince(table: SyncTable, since: string | null, limit: number) {
      let q = client.from(table).select('*').order('server_updated_at', { ascending: true }).order('id').limit(limit);
      if (since) q = q.gt('server_updated_at', since);
      const { data, error } = await q;
      if (error) throw new Error(`Falha ao baixar ${table}: ${error.message}`);
      return (data ?? []) as RemoteRow[];
    },
  };
}
