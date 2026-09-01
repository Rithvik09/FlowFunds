// Minimal, typed Plaid REST client built on native `fetch` rather than Plaid's official
// Node SDK. Deliberate choice: the official SDK is built on axios/Node's http module,
// which assumes a Node runtime — Cloudflare Workers runs a different, more restricted
// JS runtime (V8 isolates, not Node), and native `fetch` is guaranteed to work there
// without pulling in Node-compat shims for a dependency this small. Only the three
// endpoints this app actually calls are implemented.

export interface PlaidEnv {
  PLAID_CLIENT_ID: string;
  PLAID_SECRET: string;
  PLAID_ENV: string; // "sandbox" | "development" | "production"
}

function baseUrl(env: PlaidEnv): string {
  const host = env.PLAID_ENV === 'production' ? 'production' : env.PLAID_ENV === 'development' ? 'development' : 'sandbox';
  return `https://${host}.plaid.com`;
}

async function plaidFetch<T>(env: PlaidEnv, path: string, body: Record<string, unknown>): Promise<T> {
  const response = await fetch(`${baseUrl(env)}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      client_id: env.PLAID_CLIENT_ID,
      secret: env.PLAID_SECRET,
      ...body,
    }),
  });

  const json = (await response.json()) as T & { error_message?: string; error_code?: string };
  if (!response.ok) {
    throw new Error(`Plaid ${path} failed: ${json.error_code ?? response.status} ${json.error_message ?? ''}`.trim());
  }
  return json;
}

export interface LinkTokenResponse {
  link_token: string;
  expiration: string;
}

export function createLinkToken(env: PlaidEnv, userId: string): Promise<LinkTokenResponse> {
  return plaidFetch<LinkTokenResponse>(env, '/link/token/create', {
    user: { client_user_id: userId },
    client_name: 'FlowFunds',
    products: ['transactions'],
    country_codes: ['US'],
    language: 'en',
  });
}

export interface ExchangeResponse {
  access_token: string;
  item_id: string;
}

export function exchangePublicToken(env: PlaidEnv, publicToken: string): Promise<ExchangeResponse> {
  return plaidFetch<ExchangeResponse>(env, '/item/public_token/exchange', { public_token: publicToken });
}

export interface PlaidTransaction {
  transaction_id: string;
  amount: number;
  merchant_name: string | null;
  name: string;
  category: string[] | null;
  date: string;
}

export interface TransactionsSyncResponse {
  added: PlaidTransaction[];
  modified: PlaidTransaction[];
  removed: { transaction_id: string }[];
  next_cursor: string;
  has_more: boolean;
}

export function syncTransactions(env: PlaidEnv, accessToken: string, cursor: string | null): Promise<TransactionsSyncResponse> {
  return plaidFetch<TransactionsSyncResponse>(env, '/transactions/sync', {
    access_token: accessToken,
    cursor: cursor ?? undefined,
  });
}
