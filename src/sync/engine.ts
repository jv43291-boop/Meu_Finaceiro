/**
 * Motor de sincronização registro a registro, "vence o mais recente".
 *
 * 1. PUSH: envia os registros locais marcados como dirty.
 * 2. PULL: baixa o que mudou no servidor desde o último cursor
 *    (server_updated_at) e aplica localmente quando for mais novo.
 *
 * Sem dependência de React, Supabase ou SQLite: recebe as duas pontas por
 * interface, o que permite testar com implementações em memória.
 */

export const SYNC_TABLES = ['accounts', 'categories', 'recurrences', 'transactions'] as const;
export type SyncTable = (typeof SYNC_TABLES)[number];

/** Linha no formato do servidor (colunas snake_case, booleanos de verdade). */
export type RemoteRow = Record<string, unknown> & { id: string; updated_at: string; server_updated_at?: string };

export interface LocalStore {
  /** registros com dirty = 1, já no formato do servidor */
  dirty(table: SyncTable, limit: number): Promise<RemoteRow[]>;
  /** marca como enviado, se o registro não mudou de novo desde a leitura */
  markClean(table: SyncTable, rows: { id: string; updated_at: string }[]): Promise<void>;
  /** aplica linhas do servidor quando forem mais novas que as locais; devolve quantas mudaram */
  applyRemote(table: SyncTable, rows: RemoteRow[]): Promise<number>;
  getCursor(table: SyncTable): Promise<string | null>;
  setCursor(table: SyncTable, cursor: string): Promise<void>;
}

export interface RemoteStore {
  upsert(table: SyncTable, rows: RemoteRow[]): Promise<void>;
  /** linhas com server_updated_at > since, em ordem crescente */
  pullSince(table: SyncTable, since: string | null, limit: number): Promise<RemoteRow[]>;
}

export interface SyncResult {
  pushed: number;
  pulled: number;
  /** registros locais que mudaram por causa do pull (telas precisam recarregar) */
  changedLocally: number;
}

const BATCH = 500;

/**
 * Margem de segurança no cursor: uma transação que começou antes e terminou
 * depois do último pull pode ter server_updated_at um pouco menor que o cursor.
 * Rebaixar alguns segundos é seguro porque aplicar de novo não muda nada.
 */
const CURSOR_OVERLAP_MS = 5_000;

export function rewindCursor(cursor: string | null): string | null {
  if (!cursor) return null;
  const t = Date.parse(cursor);
  if (Number.isNaN(t)) return null;
  return new Date(t - CURSOR_OVERLAP_MS).toISOString();
}

/** A linha do servidor deve substituir a local? Vence o updated_at maior; empate mantém a local. */
export function remoteWins(local: { updated_at: string } | null | undefined, remote: { updated_at: string }): boolean {
  if (!local) return true;
  return Date.parse(remote.updated_at) > Date.parse(local.updated_at);
}

export async function syncOnce(local: LocalStore, remote: RemoteStore): Promise<SyncResult> {
  const result: SyncResult = { pushed: 0, pulled: 0, changedLocally: 0 };

  // regras e contas antes dos lançamentos que apontam para elas
  for (const table of SYNC_TABLES) {
    for (;;) {
      const rows = await local.dirty(table, BATCH);
      if (!rows.length) break;
      await remote.upsert(table, rows);
      await local.markClean(table, rows.map((r) => ({ id: r.id, updated_at: r.updated_at })));
      result.pushed += rows.length;
      if (rows.length < BATCH) break;
    }
  }

  for (const table of SYNC_TABLES) {
    let since = rewindCursor(await local.getCursor(table));
    let maxCursor: string | null = null;
    for (;;) {
      const rows = await remote.pullSince(table, since, BATCH);
      if (!rows.length) break;
      result.pulled += rows.length;
      result.changedLocally += await local.applyRemote(table, rows);
      const last = rows[rows.length - 1].server_updated_at ?? null;
      if (last) maxCursor = last;
      if (rows.length < BATCH || !last || last === since) break;
      since = last;
    }
    if (maxCursor) await local.setCursor(table, maxCursor);
  }

  return result;
}
