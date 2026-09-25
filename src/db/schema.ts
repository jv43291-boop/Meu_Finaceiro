import type { SQLiteDatabase } from 'expo-sqlite';

export const DATABASE_NAME = 'meu-financeiro.db';

/**
 * Migrações por PRAGMA user_version. Nunca editar uma migração já publicada:
 * sempre acrescentar uma nova no fim da lista.
 *
 * Toda tabela tem id (uuid texto), created_at, updated_at, deleted_at e dirty.
 * dirty = 1 marca o registro como pendente de envio para o Supabase (fase 2).
 */
const MIGRATIONS: string[] = [
  `
  CREATE TABLE accounts (
    id TEXT PRIMARY KEY NOT NULL,
    name TEXT NOT NULL,
    kind TEXT NOT NULL DEFAULT 'cash',
    opening_balance_cents INTEGER NOT NULL DEFAULT 0,
    color TEXT NOT NULL DEFAULT '#17B890',
    archived INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    deleted_at TEXT,
    dirty INTEGER NOT NULL DEFAULT 1
  );

  CREATE TABLE categories (
    id TEXT PRIMARY KEY NOT NULL,
    name TEXT NOT NULL,
    type TEXT NOT NULL CHECK (type IN ('income', 'expense')),
    icon TEXT NOT NULL DEFAULT 'tag-outline',
    color TEXT NOT NULL DEFAULT '#8A9491',
    archived INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    deleted_at TEXT,
    dirty INTEGER NOT NULL DEFAULT 1
  );

  CREATE TABLE recurrences (
    id TEXT PRIMARY KEY NOT NULL,
    type TEXT NOT NULL CHECK (type IN ('income', 'expense')),
    description TEXT NOT NULL,
    amount_cents INTEGER NOT NULL,
    category_id TEXT,
    account_id TEXT,
    day INTEGER NOT NULL,
    start_month TEXT NOT NULL,
    end_month TEXT,
    notes TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    deleted_at TEXT,
    dirty INTEGER NOT NULL DEFAULT 1
  );

  CREATE TABLE transactions (
    id TEXT PRIMARY KEY NOT NULL,
    type TEXT NOT NULL CHECK (type IN ('income', 'expense')),
    description TEXT NOT NULL,
    amount_cents INTEGER NOT NULL,
    date TEXT NOT NULL,
    paid INTEGER NOT NULL DEFAULT 0,
    category_id TEXT,
    account_id TEXT,
    notes TEXT NOT NULL DEFAULT '',
    recurrence_id TEXT,
    occurrence_month TEXT,
    group_id TEXT,
    installment_number INTEGER,
    installment_total INTEGER,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    deleted_at TEXT,
    dirty INTEGER NOT NULL DEFAULT 1
  );

  CREATE INDEX idx_transactions_date ON transactions (date);
  CREATE INDEX idx_transactions_group ON transactions (group_id);
  CREATE UNIQUE INDEX idx_transactions_occurrence
    ON transactions (recurrence_id, occurrence_month)
    WHERE recurrence_id IS NOT NULL;

  CREATE TABLE meta (
    key TEXT PRIMARY KEY NOT NULL,
    value TEXT NOT NULL
  );
  `,
  // 2: cartão de crédito e faturas
  `
  CREATE TABLE credit_cards (
    id TEXT PRIMARY KEY NOT NULL,
    name TEXT NOT NULL,
    limit_cents INTEGER NOT NULL DEFAULT 0,
    closing_day INTEGER NOT NULL,
    due_day INTEGER NOT NULL,
    account_id TEXT,
    color TEXT NOT NULL DEFAULT '#5B45FF',
    archived INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    deleted_at TEXT,
    dirty INTEGER NOT NULL DEFAULT 1
  );
  ALTER TABLE transactions ADD COLUMN card_id TEXT;
  ALTER TABLE transactions ADD COLUMN invoice_month TEXT;
  ALTER TABLE transactions ADD COLUMN invoice_payment INTEGER NOT NULL DEFAULT 0;
  ALTER TABLE recurrences ADD COLUMN card_id TEXT;
  CREATE INDEX idx_transactions_card ON transactions (card_id, invoice_month);
  `
];

export async function migrateDbIfNeeded(db: SQLiteDatabase): Promise<void> {
  await db.execAsync('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;');
  const row = await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version');
  let version = row?.user_version ?? 0;
  while (version < MIGRATIONS.length) {
    const sql = MIGRATIONS[version];
    await db.withTransactionAsync(async () => {
      await db.execAsync(sql);
    });
    version++;
    await db.execAsync(`PRAGMA user_version = ${version}`);
  }
}
