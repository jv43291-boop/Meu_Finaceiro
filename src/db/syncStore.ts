import type { SQLiteDatabase } from 'expo-sqlite';

import { remoteWins, SYNC_TABLES, type LocalStore, type RemoteRow, type SyncTable } from '@/sync/engine';
import { appClock } from '@/sync/clock';
import { getMeta, setMeta } from './repo';

/** Colunas sincronizadas de cada tabela (iguais no SQLite e no Supabase). */
export const COLUMNS: Record<SyncTable, string[]> = {
  accounts: ['id', 'name', 'kind', 'opening_balance_cents', 'color', 'archived', 'created_at', 'updated_at', 'deleted_at'],
  categories: ['id', 'name', 'type', 'icon', 'color', 'archived', 'budget_cents', 'created_at', 'updated_at', 'deleted_at'],
  goals: ['id', 'name', 'target_cents', 'saved_cents', 'target_date', 'icon', 'color', 'archived', 'created_at', 'updated_at', 'deleted_at'],
  credit_cards: [
    'id', 'name', 'limit_cents', 'closing_day', 'due_day', 'account_id', 'color', 'archived',
    'created_at', 'updated_at', 'deleted_at',
  ],
  recurrences: [
    'id', 'type', 'description', 'amount_cents', 'category_id', 'account_id', 'day', 'start_month', 'end_month',
    'notes', 'card_id', 'created_at', 'updated_at', 'deleted_at',
  ],
  transactions: [
    'id', 'type', 'description', 'amount_cents', 'date', 'paid', 'category_id', 'account_id', 'notes',
    'recurrence_id', 'occurrence_month', 'group_id', 'installment_number', 'installment_total',
    'card_id', 'invoice_month', 'invoice_payment', 'external_id', 'created_at', 'updated_at', 'deleted_at',
  ],
  payee_rules: ['id', 'match_name', 'match_doc', 'description', 'category_id', 'account_id', 'created_at', 'updated_at', 'deleted_at'],
};

const BOOLEAN_COLUMNS = new Set(['archived', 'paid', 'invoice_payment']);

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
      // fora os recusados que ainda estão esperando a vez; se o registro mudou depois
      // da recusa (updated_at diferente), tenta de novo na hora
      const rows = await db.getAllAsync<Row>(
        `SELECT t.* FROM ${table} t
          WHERE t.dirty = 1
            AND NOT EXISTS (SELECT 1 FROM sync_quarantine q
                             WHERE q.tbl = ? AND q.id = t.id AND q.updated_at = t.updated_at AND q.next_try_at > ?)
          ORDER BY t.updated_at LIMIT ?`,
        table, new Date().toISOString(), limit,
      );
      return rows.map((r) => toRemote(table, r));
    },

    async quarantine(table, rows, error) {
      await db.withTransactionAsync(async () => {
        for (const r of rows) {
          const prev = await db.getFirstAsync<{ attempts: number }>('SELECT attempts FROM sync_quarantine WHERE tbl = ? AND id = ?', table, r.id);
          const attempts = (prev?.attempts ?? 0) + 1;
          await db.runAsync(
            `INSERT INTO sync_quarantine (tbl, id, updated_at, attempts, last_error, next_try_at) VALUES (?, ?, ?, ?, ?, ?)
             ON CONFLICT(tbl, id) DO UPDATE SET updated_at = excluded.updated_at, attempts = excluded.attempts,
               last_error = excluded.last_error, next_try_at = excluded.next_try_at`,
            table, r.id, r.updated_at, attempts, error.slice(0, 500), new Date(Date.now() + quarantineDelay(attempts)).toISOString(),
          );
        }
      });
    },

    async release(table, ids) {
      if (!ids.length) return;
      const marks = ids.map(() => '?').join(',');
      await db.runAsync(`DELETE FROM sync_quarantine WHERE tbl = ? AND id IN (${marks})`, table, ...ids);
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
          appClock.observe(remote.updated_at);
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
            const now = appClock.now();
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
  const now = appClock.now();
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
    for (const t of SYNC_TABLES) {
      await db.runAsync(`UPDATE ${t} SET dirty = 1`);
    }
  });
}

/** Quantos registros ainda não foram enviados para a nuvem. */
export async function countDirty(db: SQLiteDatabase): Promise<number> {
  let n = 0;
  for (const t of SYNC_TABLES) {
    const r = await db.getFirstAsync<{ n: number }>(`SELECT COUNT(*) AS n FROM ${t} WHERE dirty = 1`);
    n += r?.n ?? 0;
  }
  return n;
}

/** Recusado de novo: espera cada vez mais (5 min, 15 min, 1 h, depois 6 h). */
export function quarantineDelay(attempts: number): number {
  const min = 60_000;
  return [5 * min, 15 * min, 60 * min][attempts - 1] ?? 6 * 60 * min;
}

export interface RejectedItem {
  table: SyncTable;
  id: string;
  /** descrição/nome do registro, para a pessoa reconhecer */
  label: string;
  error: string;
  attempts: number;
  nextTryAt: string;
}

const LABEL_COLUMN: Record<SyncTable, string> = {
  accounts: 'name', categories: 'name', credit_cards: 'name', goals: 'name',
  payee_rules: 'description', recurrences: 'description', transactions: 'description',
};

/** Registros recusados pelo servidor que ainda estão pendentes. */
export async function listRejected(db: SQLiteDatabase): Promise<RejectedItem[]> {
  const q = await db.getAllAsync<{ tbl: SyncTable; id: string; updated_at: string; attempts: number; last_error: string; next_try_at: string }>(
    'SELECT * FROM sync_quarantine ORDER BY next_try_at',
  );
  const out: RejectedItem[] = [];
  for (const r of q) {
    if (!SYNC_TABLES.includes(r.tbl)) continue;
    const row = await db.getFirstAsync<{ label: string | null; dirty: number; updated_at: string }>(
      `SELECT ${LABEL_COLUMN[r.tbl]} AS label, dirty, updated_at FROM ${r.tbl} WHERE id = ?`, r.id,
    );
    // já subiu ou foi apagado/alterado depois: a quarentena antiga não vale mais
    if (!row || row.dirty !== 1) {
      await db.runAsync('DELETE FROM sync_quarantine WHERE tbl = ? AND id = ?', r.tbl, r.id);
      continue;
    }
    out.push({ table: r.tbl, id: r.id, label: row.label || '(sem nome)', error: r.last_error, attempts: r.attempts, nextTryAt: r.next_try_at });
  }
  return out;
}

/** "Tentar de novo": libera o registro para a próxima sincronização. */
export async function retryRejected(db: SQLiteDatabase, table: SyncTable, id: string) {
  await db.runAsync('UPDATE sync_quarantine SET next_try_at = ? WHERE tbl = ? AND id = ?', new Date(0).toISOString(), table, id);
}

/**
 * "Descartar minha alteração": volta para a versão da nuvem (ou, se o registro
 * nunca chegou lá, apaga do aparelho).
 */
export async function discardLocal(db: SQLiteDatabase, table: SyncTable, id: string, serverRow: RemoteRow | null) {
  await db.withTransactionAsync(async () => {
    if (serverRow) {
      const cols = COLUMNS[table];
      appClock.observe(serverRow.updated_at);
      const loc = toLocal(table, serverRow);
      const values: Record<string, string | number | null> = {};
      for (const c of cols) values[`$${c}`] = loc[c] as string | number | null;
      await db.runAsync(
        `INSERT INTO ${table} (${cols.join(', ')}, dirty) VALUES (${cols.map((c) => `$${c}`).join(', ')}, 0)
         ON CONFLICT(id) DO UPDATE SET ${cols.filter((c) => c !== 'id').map((c) => `${c} = $${c}`).join(', ')}, dirty = 0`,
        values,
      );
    } else {
      await db.runAsync(`DELETE FROM ${table} WHERE id = ?`, id);
    }
    await db.runAsync('DELETE FROM sync_quarantine WHERE tbl = ? AND id = ?', table, id);
  });
}
