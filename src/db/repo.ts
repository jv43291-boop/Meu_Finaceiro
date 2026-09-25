import type { SQLiteDatabase } from 'expo-sqlite';

import { DEFAULT_ACCOUNT, DEFAULT_CATEGORIES } from '@/domain/defaults';
import { stableId } from '@/domain/ids';
import type { Changes } from '@/domain/operations';
import type { Account, Category, CreditCard, Goal, PayeeRule, Recurrence, Transaction } from '@/domain/types';

type Row = Record<string, any>;

const bool = (v: unknown) => v === 1 || v === true;

const toAccount = (r: Row): Account => ({
  id: r.id, name: r.name, kind: r.kind, openingBalanceCents: r.opening_balance_cents, color: r.color,
  archived: bool(r.archived), createdAt: r.created_at, updatedAt: r.updated_at, deletedAt: r.deleted_at,
});

const toCategory = (r: Row): Category => ({
  id: r.id, name: r.name, type: r.type, icon: r.icon, color: r.color, archived: bool(r.archived),
  budgetCents: r.budget_cents ?? null, createdAt: r.created_at, updatedAt: r.updated_at, deletedAt: r.deleted_at,
});

const toRecurrence = (r: Row): Recurrence => ({
  id: r.id, type: r.type, description: r.description, amountCents: r.amount_cents,
  categoryId: r.category_id, accountId: r.account_id, day: r.day, startMonth: r.start_month,
  endMonth: r.end_month, notes: r.notes, cardId: r.card_id ?? null, createdAt: r.created_at, updatedAt: r.updated_at,
  deletedAt: r.deleted_at,
});

const toGoal = (r: Row): Goal => ({
  id: r.id, name: r.name, targetCents: r.target_cents, savedCents: r.saved_cents, targetDate: r.target_date,
  icon: r.icon, color: r.color, archived: bool(r.archived),
  createdAt: r.created_at, updatedAt: r.updated_at, deletedAt: r.deleted_at,
});

const toCard = (r: Row): CreditCard => ({
  id: r.id, name: r.name, limitCents: r.limit_cents, closingDay: r.closing_day, dueDay: r.due_day,
  accountId: r.account_id, color: r.color, archived: bool(r.archived),
  createdAt: r.created_at, updatedAt: r.updated_at, deletedAt: r.deleted_at,
});

const toTransaction = (r: Row): Transaction => ({
  id: r.id, type: r.type, description: r.description, amountCents: r.amount_cents, date: r.date,
  paid: bool(r.paid), categoryId: r.category_id, accountId: r.account_id, notes: r.notes,
  recurrenceId: r.recurrence_id, occurrenceMonth: r.occurrence_month, groupId: r.group_id,
  installmentNumber: r.installment_number, installmentTotal: r.installment_total,
  cardId: r.card_id ?? null, invoiceMonth: r.invoice_month ?? null, invoicePayment: bool(r.invoice_payment),
  externalId: r.external_id ?? null,
  createdAt: r.created_at, updatedAt: r.updated_at, deletedAt: r.deleted_at,
});

const toPayeeRule = (r: Row): PayeeRule => ({
  id: r.id, matchName: r.match_name, matchDoc: r.match_doc ?? null, description: r.description,
  categoryId: r.category_id ?? null, accountId: r.account_id ?? null,
  createdAt: r.created_at, updatedAt: r.updated_at, deletedAt: r.deleted_at,
});

export interface Snapshot {
  accounts: Account[];
  categories: Category[];
  recurrences: Recurrence[];
  /** inclui registros excluídos (marcadores de mês pulado) */
  transactions: Transaction[];
  cards: CreditCard[];
  goals: Goal[];
  payeeRules: PayeeRule[];
}

export async function loadAll(db: SQLiteDatabase): Promise<Snapshot> {
  const [a, c, r, t, k, g, pr] = await Promise.all([
    db.getAllAsync<Row>('SELECT * FROM accounts WHERE deleted_at IS NULL ORDER BY created_at'),
    db.getAllAsync<Row>('SELECT * FROM categories WHERE deleted_at IS NULL ORDER BY type DESC, name'),
    db.getAllAsync<Row>('SELECT * FROM recurrences WHERE deleted_at IS NULL ORDER BY day, description'),
    db.getAllAsync<Row>('SELECT * FROM transactions ORDER BY date'),
    db.getAllAsync<Row>('SELECT * FROM credit_cards WHERE deleted_at IS NULL ORDER BY created_at'),
    db.getAllAsync<Row>('SELECT * FROM goals WHERE deleted_at IS NULL ORDER BY created_at'),
    db.getAllAsync<Row>('SELECT * FROM payee_rules WHERE deleted_at IS NULL ORDER BY match_name'),
  ]);
  return {
    accounts: a.map(toAccount),
    categories: c.map(toCategory),
    recurrences: r.map(toRecurrence),
    transactions: t.map(toTransaction),
    cards: k.map(toCard),
    goals: g.map(toGoal),
    payeeRules: pr.map(toPayeeRule),
  };
}

export async function upsertAccount(db: SQLiteDatabase, a: Account) {
  await db.runAsync(
    `INSERT INTO accounts (id, name, kind, opening_balance_cents, color, archived, created_at, updated_at, deleted_at, dirty)
     VALUES ($id, $name, $kind, $ob, $color, $archived, $ca, $ua, $da, 1)
     ON CONFLICT(id) DO UPDATE SET name=$name, kind=$kind, opening_balance_cents=$ob, color=$color,
       archived=$archived, updated_at=$ua, deleted_at=$da, dirty=1`,
    {
      $id: a.id, $name: a.name, $kind: a.kind, $ob: a.openingBalanceCents, $color: a.color,
      $archived: a.archived ? 1 : 0, $ca: a.createdAt, $ua: a.updatedAt, $da: a.deletedAt,
    },
  );
}

export async function upsertCard(db: SQLiteDatabase, k: CreditCard) {
  await db.runAsync(
    `INSERT INTO credit_cards (id, name, limit_cents, closing_day, due_day, account_id, color, archived, created_at, updated_at, deleted_at, dirty)
     VALUES ($id, $name, $lim, $close, $due, $acc, $color, $archived, $ca, $ua, $da, 1)
     ON CONFLICT(id) DO UPDATE SET name=$name, limit_cents=$lim, closing_day=$close, due_day=$due, account_id=$acc,
       color=$color, archived=$archived, updated_at=$ua, deleted_at=$da, dirty=1`,
    {
      $id: k.id, $name: k.name, $lim: k.limitCents, $close: k.closingDay, $due: k.dueDay, $acc: k.accountId,
      $color: k.color, $archived: k.archived ? 1 : 0, $ca: k.createdAt, $ua: k.updatedAt, $da: k.deletedAt,
    },
  );
}

export async function upsertCategory(db: SQLiteDatabase, c: Category) {
  await db.runAsync(
    `INSERT INTO categories (id, name, type, icon, color, archived, budget_cents, created_at, updated_at, deleted_at, dirty)
     VALUES ($id, $name, $type, $icon, $color, $archived, $budget, $ca, $ua, $da, 1)
     ON CONFLICT(id) DO UPDATE SET name=$name, type=$type, icon=$icon, color=$color,
       archived=$archived, budget_cents=$budget, updated_at=$ua, deleted_at=$da, dirty=1`,
    {
      $id: c.id, $name: c.name, $type: c.type, $icon: c.icon, $color: c.color,
      $archived: c.archived ? 1 : 0, $budget: c.budgetCents, $ca: c.createdAt, $ua: c.updatedAt, $da: c.deletedAt,
    },
  );
}

export async function upsertGoal(db: SQLiteDatabase, g: Goal) {
  await db.runAsync(
    `INSERT INTO goals (id, name, target_cents, saved_cents, target_date, icon, color, archived, created_at, updated_at, deleted_at, dirty)
     VALUES ($id, $name, $target, $saved, $date, $icon, $color, $archived, $ca, $ua, $da, 1)
     ON CONFLICT(id) DO UPDATE SET name=$name, target_cents=$target, saved_cents=$saved, target_date=$date, icon=$icon,
       color=$color, archived=$archived, updated_at=$ua, deleted_at=$da, dirty=1`,
    {
      $id: g.id, $name: g.name, $target: g.targetCents, $saved: g.savedCents, $date: g.targetDate, $icon: g.icon,
      $color: g.color, $archived: g.archived ? 1 : 0, $ca: g.createdAt, $ua: g.updatedAt, $da: g.deletedAt,
    },
  );
}

export async function upsertPayeeRule(db: SQLiteDatabase, p: PayeeRule) {
  await db.runAsync(
    `INSERT INTO payee_rules (id, match_name, match_doc, description, category_id, account_id, created_at, updated_at, deleted_at, dirty)
     VALUES ($id, $name, $doc, $desc, $cat, $acc, $ca, $ua, $da, 1)
     ON CONFLICT(id) DO UPDATE SET match_name=$name, match_doc=$doc, description=$desc, category_id=$cat,
       account_id=$acc, updated_at=$ua, deleted_at=$da, dirty=1`,
    {
      $id: p.id, $name: p.matchName, $doc: p.matchDoc, $desc: p.description, $cat: p.categoryId, $acc: p.accountId,
      $ca: p.createdAt, $ua: p.updatedAt, $da: p.deletedAt,
    },
  );
}

async function upsertRecurrence(db: SQLiteDatabase, r: Recurrence) {
  await db.runAsync(
    `INSERT INTO recurrences (id, type, description, amount_cents, category_id, account_id, day, start_month,
       end_month, notes, card_id, created_at, updated_at, deleted_at, dirty)
     VALUES ($id, $type, $desc, $amt, $cat, $acc, $day, $start, $end, $notes, $card, $ca, $ua, $da, 1)
     ON CONFLICT(id) DO UPDATE SET type=$type, description=$desc, amount_cents=$amt, category_id=$cat,
       account_id=$acc, day=$day, start_month=$start, end_month=$end, notes=$notes, card_id=$card, updated_at=$ua,
       deleted_at=$da, dirty=1`,
    {
      $id: r.id, $type: r.type, $desc: r.description, $amt: r.amountCents, $cat: r.categoryId,
      $acc: r.accountId, $day: r.day, $start: r.startMonth, $end: r.endMonth, $notes: r.notes,
      $card: r.cardId, $ca: r.createdAt, $ua: r.updatedAt, $da: r.deletedAt,
    },
  );
}

async function upsertTransaction(db: SQLiteDatabase, t: Transaction) {
  await db.runAsync(
    `INSERT INTO transactions (id, type, description, amount_cents, date, paid, category_id, account_id, notes,
       recurrence_id, occurrence_month, group_id, installment_number, installment_total,
       card_id, invoice_month, invoice_payment, external_id, created_at, updated_at, deleted_at, dirty)
     VALUES ($id, $type, $desc, $amt, $date, $paid, $cat, $acc, $notes, $rec, $occ, $grp, $in, $it, $card, $inv, $invp, $ext, $ca, $ua, $da, 1)
     ON CONFLICT(id) DO UPDATE SET type=$type, description=$desc, amount_cents=$amt, date=$date, paid=$paid,
       category_id=$cat, account_id=$acc, notes=$notes, recurrence_id=$rec, occurrence_month=$occ,
       group_id=$grp, installment_number=$in, installment_total=$it, card_id=$card, invoice_month=$inv,
       invoice_payment=$invp, external_id=$ext, updated_at=$ua, deleted_at=$da, dirty=1`,
    {
      $id: t.id, $type: t.type, $desc: t.description, $amt: t.amountCents, $date: t.date,
      $paid: t.paid ? 1 : 0, $cat: t.categoryId, $acc: t.accountId, $notes: t.notes,
      $rec: t.recurrenceId, $occ: t.occurrenceMonth, $grp: t.groupId, $in: t.installmentNumber,
      $it: t.installmentTotal, $card: t.cardId, $inv: t.invoiceMonth, $invp: t.invoicePayment ? 1 : 0, $ext: t.externalId ?? null, $ca: t.createdAt, $ua: t.updatedAt, $da: t.deletedAt,
    },
  );
}

/** Aplica um conjunto de mudanças numa transação só: ou grava tudo, ou nada. */
export async function applyChanges(db: SQLiteDatabase, changes: Changes, extra?: { categories?: Category[] }) {
  await db.withTransactionAsync(async () => {
    for (const c of extra?.categories ?? []) await upsertCategory(db, c);
    // regras antes das ocorrências
    for (const r of changes.recurrences) await upsertRecurrence(db, r);
    for (const t of changes.transactions) await upsertTransaction(db, t);
  });
}

/** Cria conta e categorias padrão no primeiro uso. */
export async function seedIfEmpty(db: SQLiteDatabase, _newId: () => string, now: string) {
  const row = await db.getFirstAsync<{ n: number }>('SELECT COUNT(*) AS n FROM accounts');
  if ((row?.n ?? 0) > 0) return;
  await db.withTransactionAsync(async () => {
    await upsertAccount(db, {
      // ids fixos: dois aparelhos criam a MESMA conta e categorias padrão, e o sync junta
      id: stableId('seed:account:default'), name: DEFAULT_ACCOUNT.name, kind: DEFAULT_ACCOUNT.kind, openingBalanceCents: 0,
      color: DEFAULT_ACCOUNT.color, archived: false, createdAt: now, updatedAt: now, deletedAt: null,
    });
    for (const c of DEFAULT_CATEGORIES) {
      await upsertCategory(db, {
        id: stableId(`seed:category:${c.type}:${c.name}`), name: c.name, type: c.type, icon: c.icon, color: c.color, archived: false, budgetCents: null,
        createdAt: now, updatedAt: now, deletedAt: null,
      });
    }
  });
}

export async function getMeta(db: SQLiteDatabase, key: string): Promise<string | null> {
  const r = await db.getFirstAsync<{ value: string }>('SELECT value FROM meta WHERE key = ?', key);
  return r?.value ?? null;
}

export async function setMeta(db: SQLiteDatabase, key: string, value: string) {
  await db.runAsync(
    'INSERT INTO meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
    key, value,
  );
}
