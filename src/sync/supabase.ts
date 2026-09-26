import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import Storage from 'expo-sqlite/kv-store';
import { AppState, Platform } from 'react-native';

import { offsetFromDateHeader } from './clock';


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

export { createRemoteStore } from './remote';

/**
 * Diferença entre o relógio do celular e o do Supabase (ms), pelo cabeçalho Date.
 * null quando não dá para medir (sem internet; na web o navegador esconde o cabeçalho).
 */
export async function measureClockOffset(): Promise<number | null> {
  if (!cloudConfigured) return null;
  try {
    const sent = Date.now();
    const res = await fetch(`${url}/auth/v1/health`, { headers: { apikey: key } });
    const received = Date.now();
    return offsetFromDateHeader(res.headers.get('date'), sent, received);
  } catch {
    return null;
  }
}

/** Backup do app antigo (tabela finance_backups), se existir para este usuário. */
export async function fetchLegacyBackup(client: SupabaseClient): Promise<unknown | null> {
  const { data, error } = await client.from('finance_backups').select('payload').maybeSingle();
  if (error) return null;
  return data?.payload ?? null;
}
