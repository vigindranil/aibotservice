require('dotenv').config();
const express = require('express');
const cors = require('cors');

const app = express();

// ── Middleware ──────────────────────────────────────────────────────────────
const allowedOrigins = [
  'http://localhost:5173',
  'http://127.0.0.1:5173',
  'https://aibot-lemon.vercel.app',
  'https://aibotservice-uawj.vercel.app',
];

const corsOptions = {
  origin: (origin, callback) => {
    // allow requests with no origin (e.g. curl, mobile apps)
    if (!origin || allowedOrigins.includes(origin)) return callback(null, true);
    callback(new Error('Not allowed by CORS'));
  },
  credentials: true,
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
};

// Handle OPTIONS preflight for all routes before any other middleware
app.options('*', cors(corsOptions));
app.use(cors(corsOptions));

app.use(express.json({ limit: '10kb' }));
app.use(express.urlencoded({ extended: true }));

// ── Routes ──────────────────────────────────────────────────────────────────
const chatRoutes    = require('./routes/chat');
const otpRoutes     = require('./routes/otp');
const profileRoutes = require('./routes/profile');

app.use('/api/chat',         chatRoutes);
app.use('/api/verify-otp',   otpRoutes);
app.use('/api/save-profile', profileRoutes);

// ── Health check ─────────────────────────────────────────────────────────────
app.get('/health', (req, res) => {
  res.json({ status: 'OK', message: 'GlowAI server is running', timestamp: new Date().toISOString() });
});

// ── 404 handler ──────────────────────────────────────────────────────────────
app.use((req, res) => {
  res.status(404).json({ error: 'Route not found' });
});

// ── Global error handler ─────────────────────────────────────────────────────
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  // Preserve CORS headers on error responses
  const origin = req.headers.origin;
  if (origin && allowedOrigins.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    res.setHeader('Vary', 'Origin');
  }
  res.status(500).json({ error: 'Internal server error' });
});

// ── Start server ─────────────────────────────────────────────────────────────
const pool = require('./db/connection');

async function runMigrations() {
  const DB_NAME = process.env.DB_NAME || 'skin_hair_ai';
  const columns = [
    ['country', 'VARCHAR(100) DEFAULT NULL'],
    ['state',   'VARCHAR(100) DEFAULT NULL'],
    ['city',    'VARCHAR(100) DEFAULT NULL'],
    ['pincode', 'VARCHAR(20)  DEFAULT NULL'],
  ];

  for (const [col, def] of columns) {
    try {
      const [rows] = await pool.execute(
        `SELECT COUNT(*) AS cnt FROM information_schema.COLUMNS
         WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'users' AND COLUMN_NAME = ?`,
        [DB_NAME, col]
      );
      if (rows[0].cnt === 0) {
        await pool.execute(`ALTER TABLE users ADD COLUMN ${col} ${def}`);
        console.log(`  ➕ Added column: ${col}`);
      }
    } catch (err) {
      console.warn(`Migration warning [${col}]:`, err.message);
    }
  }
  console.log('✅ DB migrations applied');
}

const PORT = process.env.PORT || 5000;
app.listen(PORT, async () => {
  console.log(`\n🌸 GlowAI Server running on http://localhost:${PORT}`);
  console.log(`   Health check: http://localhost:${PORT}/health\n`);
  await runMigrations();
});
