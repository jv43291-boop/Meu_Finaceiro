import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import Storage from 'expo-sqlite/kv-store';
import { AppState, Platform } from 'react-native';

import type { RemoteRow, RemoteStore, SyncTable } from './engine';

/**
 * Credenciais vêm do arquivo .env (não versionado):
 *   EXPO_PUBLIC_SUPABASE_URL=https://<projeto>.supabase.co
 *   EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_...
 * A chave "publishable" é pública por natureza (vai dentro do app); quem
 * protege os dados é o RLS. Nunca coloque a chave secreta/service_role aqui.
 */
const url = process.env.EXPO_PUBLIC_SUPABASE_URL ?? '';
const key = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? '';

export const cloudConfigured = /^https:\/\/.+/.test(url) && key.length > 20 && !key.includes('COLE_');

export const supabase: SupabaseClient | null = cloudConfigured
  ? createClient(url, key, {
      auth: {
        // no celular a sessão fica no SQLite (kv-store); na web, o padrão do supabase (localStorage)
        storage: Platform.OS === 'web' ? undefined : Storage,
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: false,
      },
    })
  : null;

// renova o token só com o app em primeiro plano (recomendação do Supabase para apps)
if (supabase && Platform.OS !== 'web') {
  AppState.addEventListener('change', (state) => {
    if (state === 'active') supabase.auth.startAutoRefresh();
    else supabase.auth.stopAutoRefresh();
  });
}

export function createRemoteStore(client: SupabaseClient): RemoteStore {
  return {
    async upsert(table: SyncTable, rows: RemoteRow[]) {
      const { error } = await client.from(table).upsert(rows, { onConflict: 'id' });
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

/** Backup do app antigo (tabela finance_backups), se existir para este usuário. */
export async function fetchLegacyBackup(client: SupabaseClient): Promise<unknown | null> {
  const { data, error } = await client.from('finance_backups').select('payload').maybeSingle();
  if (error) return null;
  return data?.payload ?? null;
}
