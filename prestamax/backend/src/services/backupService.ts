// backupService — snapshots atomicos de la DB SQLite con gzip.
//
// Estrategia:
//  1. VACUUM INTO crea una copia limpia y consistente del archivo .db
//     SIN lockear escrituras prolongadamente (solo durante el copy).
//  2. Comprimimos con gzip (~70% reduccion en archivos SQLite tipicos).
//  3. Retencion: mantenemos los ultimos N backups, borramos los anteriores.
//  4. Si S3_BUCKET y S3_ACCESS_KEY estan configurados, subimos a S3 tambien.
//     (Soporta R2 / B2 / S3 / Wasabi — cualquier endpoint S3-compatible)
//
// Filename format: prestamax-YYYYMMDD-HHmmss.db.gz
// Default location: <db_dir>/backups/

import fs from 'fs';
import path from 'path';
import zlib from 'zlib';
import { pipeline } from 'stream/promises';
import { getDb, DB_PATH } from '../db/database';

const BACKUP_DIR =
  process.env.BACKUP_DIR ||
  path.join(path.dirname(DB_PATH), 'backups');

const KEEP_LAST_N = parseInt(process.env.BACKUP_KEEP_LAST || '14', 10);

// Nuevos backups: prestamax-YYYYMMDD-HHmmss.db.gz
// Legacy backups (sin comprimir): prestamax-backup-YYYY-MM-DDTHH-MM-SS.db
const FILENAME_RE_NEW    = /^prestamax-\d{8}-\d{6}\.db\.gz$/;
const FILENAME_RE_LEGACY = /^prestamax-backup-[\d\-T]+\.db$/;
const FILENAME_RE = new RegExp(
  '(' + FILENAME_RE_NEW.source.slice(1, -1) + ')|(' + FILENAME_RE_LEGACY.source.slice(1, -1) + ')'
);

export interface BackupInfo {
  filename: string;
  size: number;
  createdAt: string; // ISO
}

function ensureDir(dir: string) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function timestamp(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return (
    d.getFullYear().toString() +
    pad(d.getMonth() + 1) +
    pad(d.getDate()) +
    '-' +
    pad(d.getHours()) +
    pad(d.getMinutes()) +
    pad(d.getSeconds())
  );
}

/**
 * Resuelve un nombre de archivo a la ruta absoluta del backup, validando
 * que coincida con el formato esperado (anti path traversal).
 */
export function getBackupPath(filename: string): string | null {
  if (!FILENAME_RE.test(filename)) return null;
  const full = path.resolve(BACKUP_DIR, filename);
  // Verificar que sigue dentro de BACKUP_DIR (defensa adicional)
  if (!full.startsWith(path.resolve(BACKUP_DIR))) return null;
  return full;
}

/**
 * Crea un snapshot consistente de la DB usando VACUUM INTO + gzip.
 * Retorna metadata del backup creado.
 */
export async function createBackup(): Promise<BackupInfo> {
  ensureDir(BACKUP_DIR);
  const ts = timestamp();
  const tmpFilename = `prestamax-${ts}.db.tmp`;
  const finalFilename = `prestamax-${ts}.db.gz`;
  const tmpPath = path.join(BACKUP_DIR, tmpFilename);
  const finalPath = path.join(BACKUP_DIR, finalFilename);

  // Cleanup defensivo si quedo un tmp huerfano
  try { if (fs.existsSync(tmpPath)) fs.unlinkSync(tmpPath); } catch (_) {}

  try {
    // 1) VACUUM INTO genera un snapshot limpio y atomico
    const db = getDb();
    // Escape simple comillas (defensivo aunque generemos el path nosotros)
    const safePath = tmpPath.replace(/'/g, "''");
    db.exec(`VACUUM INTO '${safePath}'`);

    if (!fs.existsSync(tmpPath)) {
      throw new Error('VACUUM INTO no genero el archivo destino');
    }

    // 2) Comprimir con gzip
    await pipeline(
      fs.createReadStream(tmpPath),
      zlib.createGzip({ level: 9 }),
      fs.createWriteStream(finalPath)
    );

    // 3) Borrar el .tmp sin comprimir
    fs.unlinkSync(tmpPath);

    const stat = fs.statSync(finalPath);

    // 4) Retencion: borrar los mas viejos
    await cleanupOldBackups();

    // 5) Upload opcional a S3
    if (process.env.S3_BUCKET && process.env.S3_ACCESS_KEY_ID) {
      try {
        await uploadToS3(finalPath, finalFilename);
        console.log(`[backup] uploaded a S3: ${finalFilename}`);
      } catch (e: any) {
        console.error('[backup] S3 upload fallo (backup local OK):', e?.message || e);
      }
    }

    console.log(`[backup] OK ${finalFilename} (${(stat.size / 1024).toFixed(1)} KB)`);

    return {
      filename: finalFilename,
      size: stat.size,
      createdAt: new Date(stat.mtimeMs).toISOString(),
    };
  } catch (err) {
    // Cleanup en caso de error
    try { if (fs.existsSync(tmpPath)) fs.unlinkSync(tmpPath); } catch (_) {}
    try { if (fs.existsSync(finalPath)) fs.unlinkSync(finalPath); } catch (_) {}
    throw err;
  }
}

/**
 * Lista los backups disponibles, ordenados por fecha desc.
 */
export function listBackups(): BackupInfo[] {
  ensureDir(BACKUP_DIR);
  try {
    return fs
      .readdirSync(BACKUP_DIR)
      .filter((f) => FILENAME_RE.test(f))
      .map((filename) => {
        const stat = fs.statSync(path.join(BACKUP_DIR, filename));
        return {
          filename,
          size: stat.size,
          createdAt: new Date(stat.mtimeMs).toISOString(),
        };
      })
      .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
  } catch (_) {
    return [];
  }
}

/**
 * Borra un backup por nombre. Devuelve true si lo borro, false si no existe
 * o el nombre es invalido.
 */
export function deleteBackup(filename: string): boolean {
  const full = getBackupPath(filename);
  if (!full || !fs.existsSync(full)) return false;
  try {
    fs.unlinkSync(full);
    return true;
  } catch (_) {
    return false;
  }
}

/**
 * Mantiene los KEEP_LAST_N backups mas recientes, borra el resto.
 */
export async function cleanupOldBackups(): Promise<number> {
  const list = listBackups();
  if (list.length <= KEEP_LAST_N) return 0;
  const toDelete = list.slice(KEEP_LAST_N);
  let deleted = 0;
  for (const b of toDelete) {
    if (deleteBackup(b.filename)) deleted++;
  }
  if (deleted > 0) {
    console.log(`[backup] retencion: borrados ${deleted} backup(s) antiguo(s)`);
  }
  return deleted;
}

/**
 * Upload a S3-compatible storage (Cloudflare R2, Backblaze B2, AWS S3, Wasabi).
 *
 * Env vars necesarias:
 *   S3_BUCKET              — nombre del bucket
 *   S3_ACCESS_KEY_ID
 *   S3_SECRET_ACCESS_KEY
 *   S3_REGION              — default 'auto' (R2) o 'us-east-1'
 *   S3_ENDPOINT            — opcional, ej: https://<accid>.r2.cloudflarestorage.com
 *   S3_PREFIX              — opcional, ej: 'prestamax-backups/'
 *
 * Import dinamico de @aws-sdk/client-s3 para no fallar si no esta instalado.
 */
async function uploadToS3(filePath: string, key: string): Promise<void> {
  let S3Client: any, PutObjectCommand: any;
  try {
    // @ts-ignore — import opcional, puede no estar instalado
    const mod = await import('@aws-sdk/client-s3');
    S3Client = mod.S3Client;
    PutObjectCommand = mod.PutObjectCommand;
  } catch {
    throw new Error('@aws-sdk/client-s3 no instalado — desactiva S3_BUCKET o instala el paquete');
  }

  const client = new S3Client({
    region: process.env.S3_REGION || 'auto',
    endpoint: process.env.S3_ENDPOINT || undefined,
    credentials: {
      accessKeyId: process.env.S3_ACCESS_KEY_ID!,
      secretAccessKey: process.env.S3_SECRET_ACCESS_KEY!,
    },
  });

  const finalKey = (process.env.S3_PREFIX || '') + key;
  const body = fs.readFileSync(filePath);

  await client.send(
    new PutObjectCommand({
      Bucket: process.env.S3_BUCKET!,
      Key: finalKey,
      Body: body,
      ContentType: 'application/gzip',
    })
  );
}

export const BACKUP_CONFIG = {
  dir: BACKUP_DIR,
  keepLast: KEEP_LAST_N,
  s3Enabled: !!(process.env.S3_BUCKET && process.env.S3_ACCESS_KEY_ID),
};
