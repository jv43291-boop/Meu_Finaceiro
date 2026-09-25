import type { SQLiteDatabase } from 'expo-sqlite';

import { remoteWins, type LocalStore, type RemoteRow, type SyncTable } from '@/sync/engine';
import { getMeta, setMeta } from './repo';

/** Colunas sincronizadas de cada tabela (iguais no SQLite e no Supabase). */
export const COLUMNS: Record<SyncTable, string[]> = {
  accounts: ['id', 'name', 'kind', 'opening_balance_cents', 'color', 'archived', 'created_at', 'updated_at', 'deleted_at'],
  categories: ['id', 'name', 'type', 'icon', 'color', 'archived', 'created_at', 'updated_at', 'deleted_at'],
  recurrences: [
    'id', 'type', 'description', 'amount_cents', 'category_id', 'account_id', 'day', 'start_month', 'end_month',
    'notes', 'created_at', 'updated_at', 'deleted_at',
  ],
  transactions: [
    'id', 'type', 'description', 'amount_cents', 'date', 'paid', 'category_id', 'account_id', 'notes',
    'recurrence_id', 'occurrence_month', 'group_id', 'installment_number', 'installment_total',
    'created_at', 'updated_at', 'deleted_at',
  ],
};

const BOOLEAN_COLUMNS = new Set(['archived', 'paid']);

type Row = Record<string, unknown>;

export function toRemote(table: SyncTable, row: Row): RemoteRow {
  const out: Row = {};
  for (const col of COLUMNS[table]) {
    const v = row[col];
    out[col] = BOOLEAN_COLUMNS.has(col) ? v === 1 || v === true : (v ?? null);
  }
  return out as RemoteRow;
}

export function toLocal(table: SyncTable, row: Row): Row {
  const out: Row = {};
  for (const col of COLUMNS[table]) {
    const v = row[col];
    if (BOOLEAN_COLUMNS.has(col)) out[col] = v ? 1 : 0;
    else if (col === 'date' && typeof v === 'string') out[col] = v.slice(0, 10);
    else if ((col.endsWith('_at')) && typeof v === 'string') out[col] = new Date(v).toISOString();
    else out[col] = v ?? null;
  }
  return out;
}

const cursorKey = (t: SyncTable) => `sync_cursor:${t}`;

export function createLocalStore(db: SQLiteDatabase): LocalStore {
  return {
    async dirty(table, limit) {
      const rows = await db.getAllAsync<Row>(`SELECT * FROM ${table} WHERE dirty = 1 ORDER BY updated_at LIMIT ?`, limit);
      return rows.map((r) => toRemote(table, r));
    },

    async markClean(table, rows) {
      await db.withTransactionAsync(async () => {
        for (const r of rows) {
          // só limpa se ninguém mexeu no registro enquanto ele subia
          await db.runAsync(`UPDATE ${table} SET dirty = 0 WHERE id = ? AND updated_at = ?`, r.id, r.updated_at);
        }
      });
    },

    async applyRemote(table, rows) {
      const cols = COLUMNS[table];
      const placeholders = cols.map((c) => `$${c}`).join(', ');
      const updates = cols.filter((c) => c !== 'id').map((c) => `${c} = $${c}`).join(', ');
      const sql = `INSERT INTO ${table} (${cols.join(', ')}, dirty) VALUES (${placeholders}, 0)
        ON CONFLICT(id) DO UPDATE SET ${updates}, dirty = 0`;
      let changed = 0;
      await db.withTransactionAsync(async () => {
        for (const remote of rows) {
          const local = await db.getFirstAsync<{ updated_at: string }>(`SELECT updated_at FROM ${table} WHERE id = ?`, remote.id);
          if (!remoteWins(local, { updated_at: new Date(remote.updated_at).toISOString() })) continue;
          const values: Record<string, string | number | null> = {};
          const loc = toLocal(table, remote);
          for (const c of cols) values[`$${c}`] = loc[c] as string | number | null;
          let incomingLoses = false;
          if (table === 'transactions' && loc.recurrence_id && loc.occurrence_month) {
            incomingLoses = await resolveOccurrenceClash(db, String(loc.id), String(loc.recurrence_id), String(loc.occurrence_month), String(loc.updated_at));
          }
          if (incomingLoses) {
            const now = new Date().toISOString();
            values.$occurrence_month = null;
            values.$deleted_at = (values.$deleted_at as string | null) ?? now;
            values.$updated_at = now;
          }
          await db.runAsync(sql, values);
          if (incomingLoses) await db.runAsync(`UPDATE ${table} SET dirty = 1 WHERE id = ?`, remote.id);
          changed++;
        }
      });
      return changed;
    },

    getCursor: (table) => getMeta(db, cursorKey(table)),
    setCursor: (table, cursor) => setMeta(db, cursorKey(table), cursor),
  };
}

/**
 * Dois registros diferentes para a mesma ocorrência (recorrência + mês) —
 * possível com dados criados antes dos ids fixos. O mais recente fica; o
 * outro é desligado da ocorrência e excluído, e essa exclusão sobe no próximo sync.
 * Devolve true quando quem perde é o registro que está chegando do servidor.
 */
async function resolveOccurrenceClash(db: SQLiteDatabase, id: string, recurrenceId: string, month: string, updatedAt: string): Promise<boolean> {
  const other = await db.getFirstAsync<{ id: string; updated_at: string }>(
    'SELECT id, updated_at FROM transactions WHERE recurrence_id = ? AND occurrence_month = ? AND id <> ?',
    recurrenceId, month, id,
  );
  if (!other) return false;
  const now = new Date().toISOString();
  if (other.updated_at > updatedAt || (other.updated_at === updatedAt && other.id > id)) return true;
  await db.runAsync(
    'UPDATE transactions SET occurrence_month = NULL, deleted_at = COALESCE(deleted_at, ?), updated_at = ?, dirty = 1 WHERE id = ?',
    now, now, other.id,
  );
  return false;
}

/** Quem é o dono dos dados sincronizados neste aparelho. */
export const SYNC_USER_KEY = 'sync_user_id';

export async function resetSyncCursors(db: SQLiteDatabase) {
  await db.runAsync("DELETE FROM meta WHERE key LIKE 'sync_cursor:%'");
}

/** Marca tudo como pendente de envio (primeiro login numa conta). */
export async function markAllDirty(db: SQLiteDatabase) {
  await db.withTransactionAsync(async () => {
    for (const t of ['accounts', 'categories', 'recurrences', 'transactions'] as const) {
      await db.runAsync(`UPDATE ${t} SET dirty = 1`);
    }
  });
}
