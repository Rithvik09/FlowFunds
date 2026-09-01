import type { BudgetRow, PlaidItemRow, TransactionRow, UserRow } from './types';
import type { PlaidTransaction } from './plaid';
import { forecastMonthEndSpend } from './forecast';

export function getUserByEmail(db: D1Database, email: string): Promise<UserRow | null> {
  return db.prepare('SELECT * FROM users WHERE email = ?').bind(email).first<UserRow>();
}

export function getUserById(db: D1Database, id: string): Promise<UserRow | null> {
  return db.prepare('SELECT * FROM users WHERE id = ?').bind(id).first<UserRow>();
}

export async function createUser(
  db: D1Database,
  params: { id: string; email: string; name: string; passwordHash: string; passwordSalt: string },
): Promise<void> {
  await db
    .prepare('INSERT INTO users (id, email, name, password_hash, password_salt) VALUES (?, ?, ?, ?, ?)')
    .bind(params.id, params.email, params.name, params.passwordHash, params.passwordSalt)
    .run();
}

export async function listTransactions(db: D1Database, userId: string): Promise<TransactionRow[]> {
  const result = await db
    .prepare('SELECT * FROM transactions WHERE user_id = ? ORDER BY date DESC LIMIT 100')
    .bind(userId)
    .all<TransactionRow>();
  return result.results;
}

export interface BudgetWithSpend extends BudgetRow {
  spent: number;
  remaining: number;
  // Forecast fields — see forecast.ts. Computed at query time from `spent`,
  // so they're always consistent with whatever's actually in `transactions`.
  projectedSpend: number;
  projectedRemaining: number;
  onPaceToExceed: boolean;
}

// "spent" is computed from real transaction rows at query time, in the same billing
// period (current calendar month) — this is the piece that used to be a hardcoded
// number in the mock dashboard and now reflects whatever's actually in `transactions`.
//
// `today` is injectable (defaults to `new Date()`) purely so this stays testable
// without mocking the system clock — the D1 query itself still uses SQLite's `now`
// for the month-scoping, so this only controls the forecast math below it.
export async function listBudgetsWithSpend(
  db: D1Database,
  userId: string,
  today: Date = new Date(),
): Promise<BudgetWithSpend[]> {
  const result = await db
    .prepare(
      `SELECT
         b.*,
         COALESCE(SUM(t.amount), 0) AS spent
       FROM budgets b
       LEFT JOIN transactions t
         ON t.user_id = b.user_id
         AND t.category = b.category
         AND strftime('%Y-%m', t.date) = strftime('%Y-%m', 'now')
       WHERE b.user_id = ?
       GROUP BY b.id`,
    )
    .bind(userId)
    .all<BudgetRow & { spent: number }>();

  return result.results.map((row) => {
    const forecast = forecastMonthEndSpend(row.spent, row.monthly_limit, today);
    return {
      ...row,
      spent: row.spent,
      remaining: row.monthly_limit - row.spent,
      projectedSpend: forecast.projectedSpend,
      projectedRemaining: forecast.projectedRemaining,
      onPaceToExceed: forecast.onPaceToExceed,
    };
  });
}

export async function upsertPlaidItem(
  db: D1Database,
  params: { id: string; userId: string; accessToken: string; itemId: string; institutionName?: string },
): Promise<void> {
  await db
    .prepare(
      `INSERT INTO plaid_items (id, user_id, access_token, item_id, institution_name)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(item_id) DO UPDATE SET access_token = excluded.access_token`,
    )
    .bind(params.id, params.userId, params.accessToken, params.itemId, params.institutionName ?? null)
    .run();
}

export function listPlaidItemsForUser(db: D1Database, userId: string): Promise<D1Result<PlaidItemRow>> {
  return db.prepare('SELECT * FROM plaid_items WHERE user_id = ?').bind(userId).all<PlaidItemRow>();
}

export async function updateSyncCursor(db: D1Database, plaidItemId: string, cursor: string): Promise<void> {
  await db.prepare('UPDATE plaid_items SET sync_cursor = ? WHERE id = ?').bind(cursor, plaidItemId).run();
}

// Idempotent by design: relies on the unique index on plaid_transaction_id, so re-running
// a sync (e.g. after a retry) can't double-insert the same Plaid transaction.
export async function insertPlaidTransactions(
  db: D1Database,
  userId: string,
  plaidItemId: string,
  transactions: PlaidTransaction[],
): Promise<void> {
  if (transactions.length === 0) return;

  const statements = transactions.map((txn) =>
    db
      .prepare(
        `INSERT INTO transactions (id, user_id, plaid_item_id, plaid_transaction_id, amount, merchant, category, date)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(plaid_transaction_id) DO NOTHING`,
      )
      .bind(
        crypto.randomUUID(),
        userId,
        plaidItemId,
        txn.transaction_id,
        txn.amount,
        txn.merchant_name ?? txn.name,
        txn.category?.[0] ?? 'uncategorized',
        txn.date,
      ),
  );

  await db.batch(statements);
}
