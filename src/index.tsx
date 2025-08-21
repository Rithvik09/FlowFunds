import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { serveStatic } from 'hono/cloudflare-workers'

const app = new Hono()

// Enable CORS for API routes
app.use('/api/*', cors())

// Serve static files
app.use('/static/*', serveStatic({ root: './public' }))

// Mock data for demonstration
const mockUsers = [
  { id: '1', email: 'admin@flowfunds.com', name: 'Admin User' }
]

const mockTransactions = [
  { id: '1', amount: 25.50, merchant: 'Coffee Shop', category: 'Dining', date: '2024-01-15' },
  { id: '2', amount: 120.00, merchant: 'Grocery Store', category: 'Groceries', date: '2024-01-14' },
  { id: '3', amount: 50.00, merchant: 'Gas Station', category: 'Transportation', date: '2024-01-13' }
]

const mockBudgets = [
  { id: '1', name: 'Dining', category: 'dining', limit: 500, spent: 156.75, remaining: 343.25 },
  { id: '2', name: 'Groceries', category: 'groceries', limit: 800, spent: 620.30, remaining: 179.70 }
]

// API Routes
app.get('/api/health', (c) => {
  return c.json({ status: 'healthy', timestamp: new Date().toISOString() })
})

app.post('/api/auth/login', async (c) => {
  const { email, password } = await c.req.json()
  
  // Mock authentication
  if (email === 'admin@flowfunds.com' && password === 'admin123') {
    return c.json({
      success: true,
      token: 'mock-jwt-token',
      user: { id: '1', email, name: 'Admin User' }
    })
  }
  
  return c.json({ error: 'Invalid credentials' }, 401)
})

app.get('/api/transactions', (c) => {
  return c.json({ transactions: mockTransactions })
})

app.get('/api/budgets', (c) => {
  return c.json({ budgets: mockBudgets })
})

app.post('/api/plaid/link-token', (c) => {
  return c.json({ 
    link_token: 'mock-link-token',
    expiration: new Date(Date.now() + 3600000).toISOString()
  })
})

app.post('/api/plaid/exchange', async (c) => {
  const { public_token } = await c.req.json()
  return c.json({
    success: true,
    message: 'Bank account linked successfully',
    institution_name: 'Demo Bank'
  })
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
            <h2 class="text-3xl font-bold text-center mb-12">Dashboard Demo</h2>
            <div class="grid lg:grid-cols-3 gap-8">
                <!-- Accounts -->
                <div class="card p-6">
                    <h3 class="text-xl font-semibold mb-4 flex items-center">
                        <i class="fas fa-university mr-2 text-blue-600"></i>
                        Accounts
                    </h3>
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
                        <div class="flex justify-between items-center p-3 bg-gray-50 rounded">
                            <div>
                                <div class="font-semibold">Savings Account</div>
                                <div class="text-sm text-gray-600">****5678</div>
                            </div>
                            <div class="text-right">
                                <div class="font-bold text-green-600">$12,890.45</div>
                            </div>
                        </div>
                    </div>
                </div>

                <!-- Recent Transactions -->
                <div class="card p-6">
                    <h3 class="text-xl font-semibold mb-4 flex items-center">
                        <i class="fas fa-receipt mr-2 text-green-600"></i>
                        Recent Transactions
                    </h3>
                    <div class="space-y-3">
                        <div class="flex justify-between items-center p-3 bg-gray-50 rounded">
                            <div>
                                <div class="font-semibold">Coffee Shop</div>
                                <div class="text-sm text-gray-600">Jan 15 • Dining</div>
                            </div>
                            <div class="text-red-600 font-bold">-$4.50</div>
                        </div>
                        <div class="flex justify-between items-center p-3 bg-gray-50 rounded">
                            <div>
                                <div class="font-semibold">Grocery Store</div>
                                <div class="text-sm text-gray-600">Jan 14 • Groceries</div>
                            </div>
                            <div class="text-red-600 font-bold">-$87.32</div>
                        </div>
                        <div class="flex justify-between items-center p-3 bg-gray-50 rounded">
                            <div>
                                <div class="font-semibold">Salary Deposit</div>
                                <div class="text-sm text-gray-600">Jan 13 • Income</div>
                            </div>
                            <div class="text-green-600 font-bold">+$3,200.00</div>
                        </div>
                    </div>
                </div>

                <!-- Budgets -->
                <div class="card p-6">
                    <h3 class="text-xl font-semibold mb-4 flex items-center">
                        <i class="fas fa-chart-pie mr-2 text-purple-600"></i>
                        Budget Overview
                    </h3>
                    <div class="space-y-4">
                        <div>
                            <div class="flex justify-between mb-2">
                                <span class="font-semibold">Dining</span>
                                <span class="text-sm text-gray-600">$156.75 / $500</span>
                            </div>
                            <div class="w-full bg-gray-200 rounded-full h-3">
                                <div class="bg-green-500 h-3 rounded-full" style="width: 31%"></div>
                            </div>
                        </div>
                        <div>
                            <div class="flex justify-between mb-2">
                                <span class="font-semibold">Groceries</span>
                                <span class="text-sm text-gray-600">$620.30 / $800</span>
                            </div>
                            <div class="w-full bg-gray-200 rounded-full h-3">
                                <div class="bg-yellow-500 h-3 rounded-full" style="width: 78%"></div>
                            </div>
                        </div>
                        <div>
                            <div class="flex justify-between mb-2">
                                <span class="font-semibold">Transportation</span>
                                <span class="text-sm text-gray-600">$280.15 / $300</span>
                            </div>
                            <div class="w-full bg-gray-200 rounded-full h-3">
                                <div class="bg-red-500 h-3 rounded-full" style="width: 93%"></div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            <div class="text-center mt-8">
                <button onclick="alert('This is a demo version. Full functionality requires backend setup with Plaid integration.')" 
                        class="bg-blue-600 text-white px-6 py-3 rounded-lg hover:bg-blue-700 transition">
                    <i class="fas fa-link mr-2"></i>
                    Link Bank Account (Demo)
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
                <p class="text-gray-400 mt-2">Built with Hono, TypeScript, and Cloudflare Pages</p>
            </div>
        </footer>

        <script>
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
                        alert('Login successful! Welcome to FlowFunds.');
                        hideLogin();
                        showDemo();
                    } else {
                        alert('Login failed: ' + (data.error || 'Unknown error'));
                    }
                } catch (error) {
                    alert('Login failed: ' + error.message);
                }
            }

            // Auto-show demo after 3 seconds
            setTimeout(() => {
                if (!document.getElementById('demo-section').classList.contains('hidden')) return;
                showDemo();
            }, 3000);
        </script>
    </body>
    </html>
  `)
})

export default app