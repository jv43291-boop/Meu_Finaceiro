/**
 * Só para testes: um banco SQLite de verdade (sql.js, em WebAssembly) com a
 * mesma interface que o app usa do expo-sqlite. Assim o schema, as migrações e
 * as consultas reais de repo.ts / syncStore.ts rodam nos testes.
 */
import initSqlJs, { type Database, type SqlValue } from 'sql.js';
import type { SQLiteDatabase } from 'expo-sqlite';

import { migrateDbIfNeeded } from '../schema';

type Params = SqlValue[] | Record<string, SqlValue>;

function params(args: unknown[]): Params | undefined {
  if (args.length === 0) return undefined;
  if (args.length === 1 && Array.isArray(args[0])) return args[0] as SqlValue[];
  if (args.length === 1 && args[0] !== null && typeof args[0] === 'object') return args[0] as Record<string, SqlValue>;
  return args as SqlValue[];
}

function adapt(raw: Database): SQLiteDatabase {
  const all = (sql: string, args: unknown[]) => {
    const st = raw.prepare(sql);
    try {
      const p = params(args);
      if (p) st.bind(p);
      const rows: Record<string, unknown>[] = [];
      while (st.step()) rows.push(st.getAsObject());
      return rows;
    } finally {
      st.free();
    }
  };
  const db = {
    async execAsync(sql: string) {
      raw.exec(sql);
    },
    async runAsync(sql: string, ...args: unknown[]) {
      const p = params(args);
      raw.run(sql, p as never);
      return { changes: raw.getRowsModified(), lastInsertRowId: 0 };
    },
    async getAllAsync(sql: string, ...args: unknown[]) {
      return all(sql, args);
    },
    async getFirstAsync(sql: string, ...args: unknown[]) {
      return all(sql, args)[0] ?? null;
    },
    async withTransactionAsync(fn: () => Promise<void>) {
      raw.exec('BEGIN');
      try {
        await fn();
        raw.exec('COMMIT');
      } catch (e) {
        raw.exec('ROLLBACK');
        throw e;
      }
    },
  };
  return db as unknown as SQLiteDatabase;
}

let SQL: Awaited<ReturnType<typeof initSqlJs>> | null = null;

/** Banco novo, vazio, já com todas as migrações do app aplicadas. */
export async function openTestDb(): Promise<SQLiteDatabase> {
  SQL ??= await initSqlJs();
  const db = adapt(new SQL.Database());
  await migrateDbIfNeeded(db);
  return db;
}
