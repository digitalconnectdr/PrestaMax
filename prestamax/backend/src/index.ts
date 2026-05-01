import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import rateLimit from 'express-rate-limit';
import dotenv from 'dotenv';

dotenv.config();

import { initializeDatabase, getDb } from './db/database';
import { router } from './routes';
import { webhookHandler } from './routes/billing';
import { errorHandler } from './middleware/errorHandler';
import {
  sanitizeInputs,
  blockKnownBots,
  detectMaliciousPayload,
  auditLogger,
} from './middleware/securityMiddleware';

initializeDatabase();

async function autoSeedIfEmpty() {
  if (process.env.NODE_ENV === 'production') return;
  try {
    const db = getDb();
    const row = db.prepare('SELECT COUNT(*) as count FROM users').get() as { count: number };
    if (row.count === 0) {
      console.log('Base de datos vacia, cargando datos de demo...');
      const { seedDatabase } = await import('./db/seed');
      seedDatabase();
      console.log('Datos de demo cargados.');
    }
  } catch (e) {
    console.log('Sin seed:', e);
  }
}
autoSeedIfEmpty();

const app = express();
const PORT = process.env.PORT || 3001;
const IS_PROD = process.env.NODE_ENV === 'production';

app.set('trust proxy', 1);

const FRONTEND_ORIGIN = process.env.FRONTEND_URL || 'http://localhost:5173';

app.use(helmet({
  contentSecurityPolicy: IS_PROD ? {
    directives: {
      defaultSrc:     ["'self'"],
      scriptSrc:      ["'self'", 'https://js.stripe.com'],
      styleSrc:       ["'self'", "'unsafe-inline'"],
      imgSrc:         ["'self'", 'data:', 'https:'],
      connectSrc:     ["'self'", FRONTEND_ORIGIN, 'https://api.stripe.com'],
      frameSrc:       ["'self'", 'https://js.stripe.com', 'https://hooks.stripe.com'],
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
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Tenant-Id', 'Stripe-Signature'],
  exposedHeaders: ['X-RateLimit-Limit', 'X-RateLimit-Remaining', 'X-RateLimit-Reset'],
}));

const rateLimitMsg = { error: 'Demasiadas solicitudes. Intenta mas tarde.' };

const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 300,
  standardHeaders: true,
  legacyHeaders:   false,
  message: rateLimitMsg,
  skip: (req) => req.path === '/health' || req.path === '/api/billing/webhook',
});

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 15,
  standardHeaders: true,
  legacyHeaders:   false,
  message: { error: 'Demasiados intentos de acceso. Espera 15 minutos e intenta de nuevo.' },
});

const registerLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders:   false,
  message: { error: 'Limite de registros alcanzado. Intenta en 1 hora.' },
});

const adminLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders:   false,
  message: rateLimitMsg,
});

const bulkLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders:   false,
  message: { error: 'Limite de exportacion alcanzado. Intenta en 15 minutos.' },
});

app.use('/api/auth/login',           authLimiter);
app.use('/api/auth/register-tenant', registerLimiter);
app.use('/api/auth/change-password', authLimiter);
app.use('/api/admin',                adminLimiter);
app.use('/api/loans/import',         bulkLimiter);
app.use('/api/',                     globalLimiter);

// IMPORTANTE: webhook de Stripe ANTES de express.json para preservar raw body
// (Stripe necesita el body como Buffer para verificar la firma HMAC)
app.post('/api/billing/webhook', express.raw({ type: 'application/json' }), webhookHandler);

app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));

app.use(auditLogger);
app.use(blockKnownBots);
app.use(sanitizeInputs);
app.use(detectMaliciousPayload);

app.use(morgan(IS_PROD ? 'combined' : 'dev'));

app.use('/api', router);

app.get('/health', (_req, res) => {
  res.json({ status: 'ok' });
});

app.use(errorHandler);

app.listen(PORT, () => {
  console.log(`PrestaMax API running on port ${PORT} [${IS_PROD ? 'PRODUCTION' : 'development'}]`);
  console.log('Security: Helmet + Rate limits + Bot blocking + Payload sanitization active');
});

export default app;
