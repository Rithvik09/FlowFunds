export interface Bindings {
  DB: D1Database;
  JWT_SECRET: string;
  PLAID_CLIENT_ID: string;
  PLAID_SECRET: string;
  PLAID_ENV: string;
}

export interface UserRow {
  id: string;
  email: string;
  name: string;
  password_hash: string;
  password_salt: string;
  created_at: string;
}

export interface TransactionRow {
  id: string;
  user_id: string;
  plaid_item_id: string | null;
  plaid_transaction_id: string | null;
  amount: number;
  merchant: string;
  category: string;
  date: string;
  created_at: string;
}

export interface BudgetRow {
  id: string;
  user_id: string;
  name: string;
  category: string;
  monthly_limit: number;
  created_at: string;
}

export interface PlaidItemRow {
  id: string;
  user_id: string;
  access_token: string;
  item_id: string;
  institution_name: string | null;
  sync_cursor: string | null;
  created_at: string;
}
