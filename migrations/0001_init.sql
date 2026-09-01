-- Core schema: users, linked Plaid items, transactions, and budgets.
-- Applied with: wrangler d1 migrations apply flowfunds-db --local  (or --remote in CI/CD).

CREATE TABLE users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  password_salt TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- One row per Plaid Item (one bank connection). access_token is sensitive — see the
-- comment in src/plaid.ts for the honest caveat on how it's stored in this project.
CREATE TABLE plaid_items (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  access_token TEXT NOT NULL,
  item_id TEXT NOT NULL UNIQUE,
  institution_name TEXT,
  sync_cursor TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_plaid_items_user_id ON plaid_items(user_id);

CREATE TABLE transactions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  plaid_item_id TEXT REFERENCES plaid_items(id),
  plaid_transaction_id TEXT,
  amount REAL NOT NULL,
  merchant TEXT NOT NULL,
  category TEXT NOT NULL,
  date TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_transactions_user_id ON transactions(user_id);
-- A given Plaid transaction should only ever be stored once per sync cursor advance.
CREATE UNIQUE INDEX idx_transactions_plaid_txn_id ON transactions(plaid_transaction_id)
  WHERE plaid_transaction_id IS NOT NULL;

-- "spent"/"remaining" are intentionally NOT columns here — they're derived from
-- transactions at query time (see src/db.ts:listBudgetsWithSpend) so they can never
-- drift out of sync with the transactions that actually back them.
CREATE TABLE budgets (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  name TEXT NOT NULL,
  category TEXT NOT NULL,
  monthly_limit REAL NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_budgets_user_id ON budgets(user_id);
