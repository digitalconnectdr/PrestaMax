import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import rateLimit from 'express-rate-limit';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config();

import { initializeDatabase, getDb } from './db/database';
import { router } from './routes';
import { errorHandler } from './middleware/errorHandler';
import {
  sanitizeInputs,
  blockKnownBots,
  detectMaliciousPayload,
  auditLogger,
} from './middleware/securityMiddleware';

// Initialize DB schema
initializeDatabase();

// Auto-seed if database is empty (first run on a new machine)
// SOLO en desarrollo. En producción la DB nueva debe quedar vacía y los
// usuarios reales se registran via /api/auth/register-tenant.
async function autoSeedIfEmpty() {
  if (process.env.NODE_ENV === 'production') {
    return;
  }
  try {
    const db = getDb();
    const row = db.prepare('SELECT COUNT(*) as count FROM users').get() as { count: number };
    if (row.count === 0) {
      console.log('Base de datos vacia, cargando datos de demo...');
      const { seedDatabase } = await import('./db/seed');
      seedDatabase();
      console.log('Datos de demo cargados. Login: admin@prestamax.com / Admin123!');
    }
  } catch (e) {
    console.log('Sin seed:', e);
  }
}

autoSeedIfEmpty();

const app = express();
const PORT = process.env.PORT || 3001;
const IS_PROD = process.env.NODE_ENV === 'production';

// Trust proxy (Render / reverse proxies)
app.set('trust proxy', 1);

// ── HELMET: Security headers ─────────────────────────────────────────────────
const FRONTEND_ORIGIN = process.env.FRONTEND_URL || 'http://localhost:5173';

app.use(helmet({
  contentSecurityPolicy: IS_PROD ? {
    directives: {
      defaultSrc:     ["'self'"],
      scriptSrc:      ["'self'", 'https://js.stripe.com'],
      styleSrc:       ["'self'", "'unsafe-inline'"],
      imgSrc:         ["'self'", 'data:', 'https:'],
      connectSrc:     ["'self'", FRONTEND_ORIGIN, 'https://api.stripe.com'],
      frameSrc:       ["'none'"],
      objectSrc:      ["'none'"],
      upgradeInsecureRequests: [],
    },
  } : false,
  noSniff:      true,
  frameguard:   { action: 'deny' },
  hidePoweredBy: true,
  xssFilter:    true,
  hsts: IS_PROD ? { maxAge: 31536000, includeSubDomains: true, preload: true } : false,
  referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
}));

// ── CORS: strict origin whitelist ────────────────────────────────────────────
const ALLOWED_ORIGINS = [
  FRONTEND_ORIGIN,
  'https://prestamax.com',
  'https://www.prestamax.com',
  'https://app.prestamax.com',
].filter(Boolean);

app.use(cors({
  origin: (origin: string | undefined, callback: (err: Error | null, allow?: boolean) => void) => {
    if (!origin || !IS_PROD) return callback(null, true);
    if (ALLOWED_ORIGINS.includes(origin)) return callback(null, true);
    callback(new Error('CORS: origin not allowed'));
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Tenant-Id'],
  exposedHeaders: ['X-RateLimit-Limit', 'X-RateLimit-Remaining', 'X-RateLimit-Reset'],
}));

// ── RATE LIMITING: tiered per endpoint type ──────────────────────────────────
const rateLimitMsg = { error: 'Demasiadas solicitudes. Intenta mas tarde.' };

// Global: 300 req / 15 min per IP  (down from 1000 — stops DDoS / bulk scraping)
const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 300,
  standardHeaders: true,
  legacyHeaders:   false,
  message: rateLimitMsg,
  skip: (req) => req.path === '/health',
});

// Auth: 15 attempts / 15 min  (stops brute-force on login)
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 15,
  standardHeaders: true,
  legacyHeaders:   false,
  message: { error: 'Demasiados intentos de acceso. Espera 15 minutos e intenta de nuevo.' },
});

// Register: 5 new accounts / hour  (stops mass account creation)
const registerLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders:   false,
  message: { error: 'Limite de registros alcanzado. Intenta en 1 hora.' },
});

// Admin panel: 100 req / 15 min
const adminLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders:   false,
  message: rateLimitMsg,
});

// Bulk export / import: 20 req / 15 min  (stops data harvesting)
const bulkLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders:   false,
  message: { error: 'Limite de exportacion alcanzado. Intenta en 15 minutos.' },
});

// Apply tiered limits BEFORE routes
app.use('/api/auth/login',           authLimiter);
app.use('/api/auth/register-tenant', registerLimiter);
app.use('/api/auth/change-password', authLimiter);
app.use('/api/admin',                adminLimiter);
app.use('/api/loans/import',         bulkLimiter);
app.use('/api/',                     globalLimiter);

// ── REQUEST PARSING (strict size limits) ─────────────────────────────────────
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));

// ── SECURITY MIDDLEWARE STACK ─────────────────────────────────────────────────
app.use(auditLogger);            // Log unusual HTTP methods
app.use(blockKnownBots);         // Block scanning tools & known bad UAs
app.use(sanitizeInputs);         // Strip null bytes, prototype pollution
app.use(detectMaliciousPayload); // Flag SQL injection / XSS patterns

// ── HTTP LOGGING ──────────────────────────────────────────────────────────────
app.use(morgan(IS_PROD ? 'combined' : 'dev'));

// ── ROUTES ────────────────────────────────────────────────────────────────────
app.use('/api', router);

// ── HEALTH CHECK ──────────────────────────────────────────────────────────────
app.get('/health', (_req, res) => {
  res.json({ status: 'ok' });
});

// ── ERROR HANDLER ─────────────────────────────────────────────────────────────
app.use(errorHandler);

app.listen(PORT, () => {
  console.log(`Pre