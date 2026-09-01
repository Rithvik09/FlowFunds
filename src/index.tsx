import { Hono } from 'hono'
import type { Context, Next } from 'hono'
import { cors } from 'hono/cors'
import type { Bindings } from './types'
import { hashPassword, verifyPassword, signJwt, verifyJwt } from './auth'
import {
  createUser,
  getUserByEmail,
  getUserById,
  listBudgetsWithSpend,
  listTransactions,
  listPlaidItemsForUser,
  upsertPlaidItem,
  updateSyncCursor,
  insertPlaidTransactions,
} from './db'
import { createLinkToken, exchangePublicToken, syncTransactions } from './plaid'

interface Variables {
  userId: string
}

type AppEnv = { Bindings: Bindings; Variables: Variables }

const app = new Hono<AppEnv>()

// Enable CORS for API routes
app.use('/api/*', cors())

// NOTE: this app has no `public/` directory and deploys to Cloudflare Pages, which serves
// static assets outside the Worker function itself — so there's nothing for a `/static/*`
// route to serve here. The old `hono/cloudflare-workers` serveStatic() this used to call is
// also now deprecated upstream in favor of Cloudflare's native Static Assets. Removed rather
// than left in pointing at a directory that doesn't exist.

// --- Auth middleware: verifies the Bearer JWT and stashes the user id on the context ---
async function requireAuth(c: Context<AppEnv>, next: Next) {
  const header = c.req.header('Authorization')
  const token = header?.startsWith('Bearer ') ? header.slice(7) : null
  if (!token) return c.json({ error: 'Missing Authorization header' }, 401)

  const payload = await verifyJwt(token, c.env.JWT_SECRET)
  if (!payload) return c.json({ error: 'Invalid or expired token' }, 401)

  c.set('userId', payload.sub)
  await next()
}

// API Routes
app.get('/api/health', (c) => {
  return c.json({ status: 'healthy', timestamp: new Date().toISOString() })
})

app.post('/api/auth/register', async (c) => {
  const { email, password, name } = await c.req.json<{ email: string; password: string; name: string }>()
  if (!email || !password || !name) {
    return c.json({ error: 'email, password, and name are all required' }, 400)
  }

  const existing = await getUserByEmail(c.env.DB, email)
  if (existing) return c.json({ error: 'An account with that email already exists' }, 409)

  const { hash, salt } = await hashPassword(password)
  const id = crypto.randomUUID()
  await createUser(c.env.DB, { id, email, name, passwordHash: hash, passwordSalt: salt })

  const token = await signJwt({ sub: id, email, exp: Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 7 }, c.env.JWT_SECRET)
  return c.json({ success: true, token, user: { id, email, name } })
})

app.post('/api/auth/login', async (c) => {
  const { email, password } = await c.req.json<{ email: string; password: string }>()

  const user = await getUserByEmail(c.env.DB, email)
  if (!user) return c.json({ error: 'Invalid credentials' }, 401)

  const valid = await verifyPassword(password, user.password_hash, user.password_salt)
  if (!valid) return c.json({ error: 'Invalid credentials' }, 401)

  const token = await signJwt(
    { sub: user.id, email: user.email, exp: Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 7 },
    c.env.JWT_SECRET,
  )
  return c.json({ success: true, token, user: { id: user.id, email: user.email, name: user.name } })
})

app.get('/api/transactions', requireAuth, async (c) => {
  const userId = c.get('userId') as string
  const transactions = await listTransactions(c.env.DB, userId)
  return c.json({ transactions })
})

app.get('/api/budgets', requireAuth, async (c) => {
  const userId = c.get('userId') as string
  const budgets = await listBudgetsWithSpend(c.env.DB, userId)
  return c.json({ budgets })
})

app.post('/api/plaid/link-token', requireAuth, async (c) => {
  const userId = c.get('userId') as string
  try {
    const { link_token, expiration } = await createLinkToken(c.env, userId)
    return c.json({ link_token, expiration })
  } catch (error) {
    console.error('Plaid link-token error:', error)
    return c.json({ error: (error as Error).message }, 502)
  }
})

app.post('/api/plaid/exchange', requireAuth, async (c) => {
  const userId = c.get('userId') as string
  const { public_token } = await c.req.json<{ public_token: string }>()

  try {
    const { access_token, item_id } = await exchangePublicToken(c.env, public_token)
    const plaidItemId = crypto.randomUUID()
    await upsertPlaidItem(c.env.DB, { id: plaidItemId, userId, accessToken: access_token, itemId: item_id })

    // Pull the first page of transactions immediately so the dashboard has real data
    // right after linking, instead of waiting for a separate manual sync call.
    const firstPage = await syncTransactions(c.env, access_token, null)
    await insertPlaidTransactions(c.env.DB, userId, plaidItemId, [...firstPage.added, ...firstPage.modified])
    await updateSyncCursor(c.env.DB, plaidItemId, firstPage.next_cursor)

    return c.json({ success: true, message: 'Bank account linked successfully', imported: firstPage.added.length })
  } catch (error) {
    console.error('Plaid exchange error:', error)
    return c.json({ error: (error as Error).message }, 502)
  }
})

app.post('/api/plaid/sync', requireAuth, async (c) => {
  const userId = c.get('userId') as string
  const items = await listPlaidItemsForUser(c.env.DB, userId)

  let totalImported = 0
  for (const item of items.results) {
    let cursor = item.sync_cursor
    let hasMore = true
    while (hasMore) {
      const page = await syncTransactions(c.env, item.access_token, cursor)
      await insertPlaidTransactions(c.env.DB, userId, item.id, [...page.added, ...page.modified])
      totalImported += page.added.length
      cursor = page.next_cursor
      hasMore = page.has_more
      await updateSyncCursor(c.env.DB, item.id, cursor)
    }
  }

  return c.json({ success: true, imported: totalImported })
})

app.get('/api/me', requireAuth, async (c) => {
  const userId = c.get('userId') as string
  const user = await getUserById(c.env.DB, userId)
  if (!user) return c.json({ error: 'User not found' }, 404)
  return c.json({ id: user.id, email: user.email, name: user.name })
})

// Main application route
app.get('/', (c) => {
  return c.html(`
    <!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>FlowFunds - Intelligent Budget & Spending Companion</title>
        <script src="https://cdn.tailwindcss.com"></script>
        <script src="https://cdn.plaid.com/link/v2/stable/link-initialize.js"></script>
        <link href="https://cdn.jsdelivr.net/npm/@fortawesome/fontawesome-free@6.4.0/css/all.min.css" rel="stylesheet">
        <style>
          .gradient-bg { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); }
          .card { background: white; border-radius: 12px; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1); }
        </style>
    </head>
    <body class="bg-gray-50">
        <!-- Navigation -->
        <nav class="bg-blue-800 text-white p-4">
            <div class="max-w-6xl mx-auto flex justify-between items-center">
                <h1 class="text-2xl font-bold">💰 FlowFunds</h1>
                <div class="space-x-4">
                    <button onclick="showLogin()" class="bg-blue-600 px-4 py-2 rounded hover:bg-blue-700">Login</button>
                </div>
            </div>
        </nav>

        <!-- Hero Section -->
        <div class="gradient-bg text-white py-20">
            <div class="max-w-4xl mx-auto text-center px-4">
                <h1 class="text-5xl font-bold mb-6">Intelligent Budget & Spending Companion</h1>
                <p class="text-xl mb-8">Connect real bank accounts, track spending, get proactive nudges, and forecast your financial future.</p>
                <button onclick="showDemo()" class="bg-white text-blue-800 px-8 py-3 rounded-lg text-lg font-semibold hover:bg-gray-100 transition">
                    <i class="fas fa-play mr-2"></i>Try Demo
                </button>
            </div>
        </div>

        <!-- Features Section -->
        <div class="max-w-6xl mx-auto py-16 px-4">
            <h2 class="text-3xl font-bold text-center mb-12">What Makes FlowFunds Unique</h2>
            <div class="grid md:grid-cols-2 lg:grid-cols-4 gap-8">
                <div class="card p-6 text-center">
                    <i class="fas fa-link text-3xl text-blue-600 mb-4"></i>
                    <h3 class="text-xl font-semibold mb-2">Live Bank Sync</h3>
                    <p class="text-gray-600">Connect real accounts via Plaid; import and categorize transactions automatically.</p>
                </div>
                <div class="card p-6 text-center">
                    <i class="fas fa-bell text-3xl text-green-600 mb-4"></i>
                    <h3 class="text-xl font-semibold mb-2">Proactive Nudges</h3>
                    <p class="text-gray-600">Get alerts when trends suggest you'll overshoot a budget before it happens.</p>
                </div>
                <div class="card p-6 text-center">
                    <i class="fas fa-users text-3xl text-purple-600 mb-4"></i>
                    <h3 class="text-xl font-semibold mb-2">Collaborative Budgets</h3>
                    <p class="text-gray-600">Share budgets with partners and set rules for everyone.</p>
                </div>
                <div class="card p-6 text-center">
                    <i class="fas fa-brain text-3xl text-orange-600 mb-4"></i>
                    <h3 class="text-xl font-semibold mb-2">Emotion-Aware</h3>
                    <p class="text-gray-600">Tag purchases with emotions to reveal your spending psychology.</p>
                </div>
            </div>
        </div>

        <!-- Dashboard Demo Section -->
        <div id="demo-section" class="max-w-6xl mx-auto py-16 px-4 hidden">
            <h2 class="text-3xl font-bold text-center mb-12">Dashboard</h2>
            <div class="grid lg:grid-cols-3 gap-8">
                <!-- Accounts (still illustrative/static — not yet wired to Plaid /accounts/get) -->
                <div class="card p-6">
                    <h3 class="text-xl font-semibold mb-4 flex items-center">
                        <i class="fas fa-university mr-2 text-blue-600"></i>
                        Accounts
                    </h3>
                    <p class="text-sm text-gray-500 mb-3">Illustrative — account balances aren't wired to Plaid yet, only transactions are.</p>
                    <div class="space-y-3">
                        <div class="flex justify-between items-center p-3 bg-gray-50 rounded">
                            <div>
                                <div class="font-semibold">Chase Checking</div>
                                <div class="text-sm text-gray-600">****1234</div>
                            </div>
                            <div class="text-right">
                                <div class="font-bold text-green-600">$3,245.67</div>
                            </div>
                        </div>
                    </div>
                </div>

                <!-- Recent Transactions — real data from GET /api/transactions -->
                <div class="card p-6">
                    <h3 class="text-xl font-semibold mb-4 flex items-center">
                        <i class="fas fa-receipt mr-2 text-green-600"></i>
                        Recent Transactions
                    </h3>
                    <div id="transactions-list" class="space-y-3">
                        <p class="text-sm text-gray-500">Log in to load real transactions.</p>
                    </div>
                </div>

                <!-- Budgets — real data from GET /api/budgets, spend computed from transactions -->
                <div class="card p-6">
                    <h3 class="text-xl font-semibold mb-4 flex items-center">
                        <i class="fas fa-chart-pie mr-2 text-purple-600"></i>
                        Budget Overview
                    </h3>
                    <div id="budgets-list" class="space-y-4">
                        <p class="text-sm text-gray-500">Log in to load real budgets.</p>
                    </div>
                </div>
            </div>

            <div class="text-center mt-8">
                <button onclick="linkBankAccount()" class="bg-blue-600 text-white px-6 py-3 rounded-lg hover:bg-blue-700 transition">
                    <i class="fas fa-link mr-2"></i>
                    Link Bank Account
                </button>
                <button onclick="syncTransactions()" class="ml-3 bg-gray-200 text-gray-800 px-6 py-3 rounded-lg hover:bg-gray-300 transition">
                    <i class="fas fa-rotate mr-2"></i>
                    Sync Transactions
                </button>
            </div>
        </div>

        <!-- Login Modal -->
        <div id="login-modal" class="fixed inset-0 bg-black bg-opacity-50 hidden flex items-center justify-center">
            <div class="card p-8 w-full max-w-md mx-4">
                <h2 class="text-2xl font-bold mb-6 text-center">Login to FlowFunds</h2>
                <form onsubmit="handleLogin(event)">
                    <div class="mb-4">
                        <label class="block text-gray-700 text-sm font-bold mb-2">Email</label>
                        <input type="email" id="email" value="admin@flowfunds.com"
                               class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:border-blue-500">
                    </div>
                    <div class="mb-6">
                        <label class="block text-gray-700 text-sm font-bold mb-2">Password</label>
                        <input type="password" id="password" value="admin123"
                               class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:border-blue-500">
                    </div>
                    <button type="submit" class="w-full bg-blue-600 text-white py-2 rounded-lg hover:bg-blue-700 transition">
                        Sign In
                    </button>
                </form>
                <button onclick="hideLogin()" class="mt-4 text-gray-500 hover:text-gray-700">Close</button>
            </div>
        </div>

        <!-- Footer -->
        <footer class="bg-gray-800 text-white py-8 mt-16">
            <div class="max-w-6xl mx-auto text-center px-4">
                <p>&copy; 2024 FlowFunds - Intelligent Budget & Spending Companion</p>
                <p class="text-gray-400 mt-2">Built with Hono, TypeScript, Cloudflare D1, and real Plaid integration</p>
            </div>
        </footer>

        <script>
            const AUTH_TOKEN_KEY = 'flowfunds_token';

            function showLogin() {
                document.getElementById('login-modal').classList.remove('hidden');
            }

            function hideLogin() {
                document.getElementById('login-modal').classList.add('hidden');
            }

            function showDemo() {
                document.getElementById('demo-section').classList.remove('hidden');
                document.getElementById('demo-section').scrollIntoView({ behavior: 'smooth' });
            }

            function authHeaders() {
                const token = localStorage.getItem(AUTH_TOKEN_KEY);
                return token ? { 'Authorization': 'Bearer ' + token } : {};
            }

            async function handleLogin(event) {
                event.preventDefault();
                const email = document.getElementById('email').value;
                const password = document.getElementById('password').value;

                try {
                    const response = await fetch('/api/auth/login', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ email, password })
                    });

                    const data = await response.json();

                    if (data.success) {
                        localStorage.setItem(AUTH_TOKEN_KEY, data.token);
                        hideLogin();
                        showDemo();
                        loadDashboard();
                    } else {
                        alert('Login failed: ' + (data.error || 'Unknown error'));
                    }
                } catch (error) {
                    alert('Login failed: ' + error.message);
                }
            }

            async function loadDashboard() {
                const [txResp, budgetResp] = await Promise.all([
                    fetch('/api/transactions', { headers: authHeaders() }),
                    fetch('/api/budgets', { headers: authHeaders() }),
                ]);

                if (txResp.ok) {
                    const { transactions } = await txResp.json();
                    renderTransactions(transactions);
                }
                if (budgetResp.ok) {
                    const { budgets } = await budgetResp.json();
                    renderBudgets(budgets);
                }
            }

            function renderTransactions(transactions) {
                const el = document.getElementById('transactions-list');
                if (!transactions.length) {
                    el.innerHTML = '<p class="text-sm text-gray-500">No transactions yet — link a bank account or sync.</p>';
                    return;
                }
                el.innerHTML = transactions.slice(0, 5).map(function (t) {
                    return '<div class="flex justify-between items-center p-3 bg-gray-50 rounded">' +
                        '<div><div class="font-semibold">' + t.merchant + '</div>' +
                        '<div class="text-sm text-gray-600">' + t.date + ' • ' + t.category + '</div></div>' +
                        '<div class="text-red-600 font-bold">-$' + Number(t.amount).toFixed(2) + '</div></div>';
                }).join('');
            }

            function renderBudgets(budgets) {
                const el = document.getElementById('budgets-list');
                if (!budgets.length) {
                    el.innerHTML = '<p class="text-sm text-gray-500">No budgets set up yet.</p>';
                    return;
                }
                el.innerHTML = budgets.map(function (b) {
                    const pct = Math.min(100, Math.round((b.spent / b.monthly_limit) * 100));
                    const color = pct >= 90 ? 'bg-red-500' : pct >= 70 ? 'bg-yellow-500' : 'bg-green-500';
                    const alert = b.onPaceToExceed
                        ? '<div class="text-xs text-red-600 mt-1"><i class="fas fa-triangle-exclamation mr-1"></i>' +
                          'On pace for $' + b.projectedSpend.toFixed(2) + ' by month end — ' +
                          '$' + Math.abs(b.projectedRemaining).toFixed(2) + ' over budget</div>'
                        : '<div class="text-xs text-gray-500 mt-1">Projected month-end: $' + b.projectedSpend.toFixed(2) + '</div>';
                    return '<div><div class="flex justify-between mb-2">' +
                        '<span class="font-semibold">' + b.name + '</span>' +
                        '<span class="text-sm text-gray-600">$' + b.spent.toFixed(2) + ' / $' + b.monthly_limit.toFixed(2) + '</span></div>' +
                        '<div class="w-full bg-gray-200 rounded-full h-3"><div class="' + color + ' h-3 rounded-full" style="width: ' + pct + '%"></div></div>' +
                        alert + '</div>';
                }).join('');
            }

            async function linkBankAccount() {
                try {
                    const resp = await fetch('/api/plaid/link-token', { method: 'POST', headers: authHeaders() });
                    const data = await resp.json();
                    if (!resp.ok) throw new Error(data.error || 'Failed to create link token');

                    const handler = Plaid.create({
                        token: data.link_token,
                        onSuccess: async function (public_token) {
                            const exchangeResp = await fetch('/api/plaid/exchange', {
                                method: 'POST',
                                headers: Object.assign({ 'Content-Type': 'application/json' }, authHeaders()),
                                body: JSON.stringify({ public_token: public_token })
                            });
                            const exchangeData = await exchangeResp.json();
                            if (exchangeData.success) {
                                alert('Linked! Imported ' + exchangeData.imported + ' transactions.');
                                loadDashboard();
                            } else {
                                alert('Link succeeded but exchange failed: ' + exchangeData.error);
                            }
                        },
                        onExit: function () {},
                    });
                    handler.open();
                } catch (error) {
                    alert('Could not start Plaid Link: ' + error.message + ' (needs real PLAID_CLIENT_ID/PLAID_SECRET configured as Worker secrets)');
                }
            }

            async function syncTransactions() {
                const resp = await fetch('/api/plaid/sync', { method: 'POST', headers: authHeaders() });
                const data = await resp.json();
                if (resp.ok) {
                    alert('Synced. Imported ' + data.imported + ' new transactions.');
                    loadDashboard();
                } else {
                    alert('Sync failed: ' + data.error);
                }
            }

            // If already logged in from a previous visit, skip straight to the dashboard.
            if (localStorage.getItem(AUTH_TOKEN_KEY)) {
                showDemo();
                loadDashboard();
            } else {
                setTimeout(showDemo, 3000);
            }
        </script>
    </body>
    </html>
  `)
})

export default app
