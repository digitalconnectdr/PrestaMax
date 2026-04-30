/**
 * ─────────────────────────────────────────────────────────────────────────────
 * PrestaMax — Security Middleware Layer
 * Protections:
 *   1. Input sanitization — strips XSS vectors, null bytes, prototype pollution
 *   2. Bot / scraper detection — rejects known automated user-agents
 *   3. Suspicious payload detection — flags SQL injection & script injection attempts
 *   4. Request fingerprinting — logs suspicious patterns for audit
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { Request, Response, NextFunction } from 'express';

// ─── 1. Input Sanitization ───────────────────────────────────────────────────

/** Strip null bytes, control characters, and trim whitespace from a string */
function stripDangerousChars(value: string): string {
  return value
    .replace(/\0/g, '')                    // null bytes
    .replace(/[\x01-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '') // control chars
    .trim();
}

/** Very basic HTML/script tag remover for string fields that should never contain HTML */
function stripHtmlTags(value: string): string {
  return value.replace(/<[^>]*>/g, '');
}

/** Detect prototype pollution attempts in keys */
function hasPollutedKey(obj: any): boolean {
  if (typeof obj !== 'object' || obj === null) return false;
  const dangerous = ['__proto__', 'constructor', 'prototype'];
  for (const key of Object.keys(obj)) {
    if (dangerous.includes(key)) return true;
    if (typeof obj[key] === 'object' && hasPollutedKey(obj[key])) return true;
  }
  return false;
}

/** Recursively sanitize all string values in a request body */
function sanitizeObject(obj: any, depth = 0): any {
  if (depth > 8) return obj; // prevent deep recursion attacks
  if (typeof obj === 'string') return stripDangerousChars(obj);
  if (Array.isArray(obj)) return obj.map(item => sanitizeObject(item, depth + 1));
  if (typeof obj === 'object' && obj !== null) {
    const cleaned: Record<string, any> = {};
    for (const [key, val] of Object.entries(obj)) {
      cleaned[key] = sanitizeObject(val, depth + 1);
    }
    return cleaned;
  }
  return obj;
}

export const sanitizeInputs = (req: Request, res: Response, next: NextFunction): void => {
  // Block prototype pollution
  if (req.body && hasPollutedKey(req.body)) {
    res.status(400).json({ error: 'Solicitud inválida: estructura de datos no permitida.' });
    return;
  }
  if (req.body && typeof req.body === 'object') {
    req.body = sanitizeObject(req.body);
  }
  next();
};

// ─── 2. Bot / Scraper Detection ──────────────────────────────────────────────

/**
 * Known bot/scraper user-agent patterns.
 * We allow legitimate browsers and REST clients used by the app itself.
 */
const BOT_UA_PATTERNS = [
  /python-requests/i,
  /python-urllib/i,
  /go-http-client/i,
  /java\/\d/i,
  /libwww-perl/i,
  /scrapy/i,
  /wget\//i,
  /nikto/i,
  /sqlmap/i,
  /nmap/i,
  /masscan/i,
  /zgrab/i,
  /dirbuster/i,
  /hydra/i,
  /havij/i,
  /burpsuite/i,
  /zap\//i,                // OWASP ZAP
  /acunetix/i,
  /nessus/i,
  /openvas/i,
  /metasploit/i,
];

export const blockKnownBots = (req: Request, res: Response, next: NextFunction): void => {
  const ua = req.headers['user-agent'] || '';

  // Reject completely absent user-agents on API routes (legitimate apps always send UA)
  if (!ua && req.path.startsWith('/api/') && !req.path.startsWith('/api/public')) {
    res.status(403).json({ error: 'Acceso no autorizado.' });
    return;
  }

  // Reject known malicious / scanning user-agents
  if (ua && BOT_UA_PATTERNS.some(pattern => pattern.test(ua))) {
    console.warn(`[SECURITY] Bot UA blocked: "${ua}" from ${req.ip} on ${req.method} ${req.path}`);
    res.status(403).json({ error: 'Acceso no autorizado.' });
    return;
  }

  next();
};

// ─── 3. Suspicious Payload Detection ────────────────────────────────────────

/**
 * Detect common SQL injection and XSS patterns in query strings and body.
 * This is a defense-in-depth layer — the ORM/prepared statements are the primary defense.
 */
const SQL_INJECTION_PATTERNS = [
  /(\s|^)(union\s+select|select\s+.*\s+from|insert\s+into|delete\s+from|drop\s+table|exec\s*\(|execute\s*\(|xp_cmdshell|cast\s*\(|convert\s*\(|information_schema)/i,
  /(\s|^)(or\s+1\s*=\s*1|and\s+1\s*=\s*1|'\s+or\s+'|1'\s+or\s+'1'\s*=\s*'1)/i,
];

const XSS_PATTERNS = [
  /<script[\s>]/i,
  /javascript\s*:/i,
  /on(load|error|click|mouseover|focus|blur|submit|change|keydown|keyup|input)\s*=/i,
  /eval\s*\(/i,
  /document\.(cookie|write|location)/i,
  /window\.(location|open)/i,
  /src\s*=\s*['"]?\s*(https?:\/\/|\/\/)/i,
  /data\s*:\s*text\/html/i,
];

function containsSuspiciousContent(value: string): boolean {
  return SQL_INJECTION_PATTERNS.some(p => p.test(value)) || XSS_PATTERNS.some(p => p.test(value));
}

function checkObjectForAttacks(obj: any, depth = 0): boolean {
  if (depth > 6) return false;
  if (typeof obj === 'string') return containsSuspiciousContent(obj);
  if (Array.isArray(obj)) return obj.some(item => checkObjectForAttacks(item, depth + 1));
  if (typeof obj === 'object' && obj !== null) {
    return Object.values(obj).some(val => checkObjectForAttacks(val, depth + 1));
  }
  return false;
}

export const detectMaliciousPayload = (req: Request, res: Response, next: NextFunction): void => {
  // Check body
  if (req.body && checkObjectForAttacks(req.body)) {
    console.warn(`[SECURITY] Suspicious payload from ${req.ip} on ${req.method} ${req.path}`);
    res.status(400).json({ error: 'Solicitud contiene contenido no permitido.' });
    return;
  }
  // Check query string values
  for (const val of Object.values(req.query)) {
    const s = Array.isArray(val) ? val.join('') : String(val || '');
    if (containsSuspiciousContent(s)) {
      console.warn(`[SECURITY] Suspicious query string from ${req.ip} on ${req.method} ${req.path}`);
      res.status(400).json({ error: 'Parámetros de búsqueda inválidos.' });
      return;
    }
  }
  next();
};

// ─── 4. Oversized Request Guard ──────────────────────────────────────────────

/**
 * Extra body-size guard for sensitive endpoints (auth, admin).
 * Express's json({ limit }) already handles global limits, but auth routes
 * should never receive large payloads — anything big is suspicious.
 */
export const limitAuthPayload = (req: Request, res: Response, next: NextFunction): void => {
  const contentLength = parseInt(req.headers['content-length'] || '0', 10);
  const MAX_AUTH_BYTES = 2048; // 2 KB is more than enough for login/register
  if (contentLength > MAX_AUTH_BYTES) {
    res.status(413).json({ error: 'Cuerpo de solicitud demasiado grande.' });
    return;
  }
  next();
};

// ─── 5. Security Audit Logger ────────────────────────────────────────────────

/** Log unusual HTTP methods and paths for audit purposes */
export const auditLogger = (req: Request, _res: Response, next: NextFunction): void => {
  const suspiciousMethods = ['TRACE', 'TRACK', 'OPTIONS', 'CONNECT'];
  if (suspiciousMethods.includes(req.method)) {
    console.warn(`[AUDIT] Unusual method ${req.method} from ${req.ip} on ${req.path}`);
  }
  next();
};
