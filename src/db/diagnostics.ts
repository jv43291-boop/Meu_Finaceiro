/** Números técnicos do banco local para a tela de diagnóstico (sem conteúdo financeiro). */
import type { SQLiteDatabase } from 'expo-sqlite';

import { SYNC_TABLES, type SyncTable } from '@/sync/engine';

export interface TableStats {
  table: SyncTable;
  total: number;
  deleted: number;
  pending: number;
}

export interface SqliteHealth {
  ok: boolean;
  /** resultado do PRAGMA integrity_check ("ok" quando está tudo certo) */
  check: string;
  schemaVersion: number;
  tables: TableStats[];
  quarantined: number;
}

export async function sqliteHealth(db: SQLiteDatabase): Promise<SqliteHealth> {
  const check = await db.getFirstAsync<Record<string, string>>('PRAGMA integrity_check');
  const version = await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version');
  const tables: TableStats[] = [];
  for (const t of SYNC_TABLES) {
    const r = await db.getFirstAsync<{ total: number; deleted: number; pending: number }>(
      `SELECT COUNT(*) AS total,
              SUM(CASE WHEN deleted_at IS NOT NULL THEN 1 ELSE 0 END) AS deleted,
              SUM(CASE WHEN dirty = 1 THEN 1 ELSE 0 END) AS pending
         FROM ${t}`,
    );
    tables.push({ table: t, total: r?.total ?? 0, deleted: r?.deleted ?? 0, pending: r?.pending ?? 0 });
  }
  const q = await db.getFirstAsync<{ n: number }>('SELECT COUNT(*) AS n FROM sync_quarantine');
  const result = check ? String(Object.values(check)[0]) : 'sem resposta';
  return { ok: result === 'ok', check: result, schemaVersion: version?.user_version ?? 0, tables, quarantined: q?.n ?? 0 };
}
