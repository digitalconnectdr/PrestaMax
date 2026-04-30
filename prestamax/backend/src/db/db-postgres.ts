/**
 * PostgreSQL Database Adapter for PrestaMax
 *
 * This module provides a thin abstraction layer over node-postgres (pg) to make
 * migration from SQLite to Supabase PostgreSQL easier. It maintains a connection
 * pool and exposes simple query helpers.
 *
 * Usage:
 *   import pool from './db-postgres';
 *   const result = await pool.query('SELECT * FROM users WHERE id = $1', [userId]);
 *   const rows = result.rows;
 */

import { Pool, QueryResult } from 'pg';

// ──────────────────────────────────────────────────────────────────────────────
// Pool Configuration
// ──────────────────────────────────────────────────────────────────────────────

const pool = new Pool({
  // DATABASE_URL format for Supabase:
  // postgresql://postgres:[PASSWORD]@db.[PROJECT-REF].supabase.co:5432/postgres
  connectionString: process.env.DATABASE_URL,

  // SSL configuration: required in production, optional in development
  ssl: process.env.NODE_ENV === 'production'
    ? { rejectUnauthorized: false }  // Supabase uses self-signed certs
    : false,

  // Connection pool settings
  max: parseInt(process.env.DB_POOL_SIZE || '10'),
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000,
});

// ──────────────────────────────────────────────────────────────────────────────
// Event Handlers
// ──────────────────────────────────────────────────────────────────────────────

pool.on('error', (err) => {
  console.error('Unexpected error on idle client', err);
  process.exit(-1);
});

// ──────────────────────────────────────────────────────────────────────────────
// Query Helpers — SQLite compatibility shim
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Execute a query and return all rows.
 *
 * Equivalent to SQLite: db.prepare(sql).all(...params)
 *
 * @param sql SQL query string (use $1, $2, etc. for parameters)
 * @param params Array of parameter values
 * @returns Array of row objects
 *
 * @example
 *   const rows = await query(
 *     'SELECT * FROM loans WHERE tenant_id = $1 AND status = $2',
 *     [tenantId, 'active']
 *   );
 */
export async function query(sql: string, params: any[] = []): Promise<any[]> {
  const result = await pool.query(sql, params);
  return result.rows;
}

/**
 * Execute a query and return the first row, or undefined if no rows.
 *
 * Equivalent to SQLite: db.prepare(sql).get(...params)
 *
 * @param sql SQL query string (use $1, $2, etc. for parameters)
 * @param params Array of parameter values
 * @returns First row object, or undefined
 *
 * @example
 *   const loan = await queryOne(
 *     'SELECT * FROM loans WHERE id = $1',
 *     [loanId]
 *   );
 */
export async function queryOne(sql: string, params: any[] = []): Promise<any | undefined> {
  const result = await pool.query(sql, params);
  return result.rows[0];
}

/**
 * Execute a query that returns a single scalar value.
 *
 * Useful for COUNT, SUM, AVG, etc.
 *
 * @param sql SQL query string (use $1, $2, etc. for parameters)
 * @param params Array of parameter values
 * @returns The scalar value from the first row/column
 *
 * @example
 *   const count = await queryScalar(
 *     'SELECT COUNT(*) as cnt FROM loans WHERE tenant_id = $1',
 *     [tenantId]
 *   );
 */
export async function queryScalar(sql: string, params: any[] = []): Promise<any> {
  const result = await pool.query(sql, params);
  if (result.rows.length === 0) return null;

  // Get the first column value of the first row
  const firstRow = result.rows[0];
  return Object.values(firstRow)[0];
}

/**
 * Execute a DML query (INSERT, UPDATE, DELETE) and return affected row count.
 *
 * Equivalent to SQLite: db.prepare(sql).run(...params)
 *
 * @param sql SQL query string (use $1, $2, etc. for parameters)
 * @param params Array of parameter values
 * @returns Number of affected rows
 *
 * @example
 *   const affected = await execute(
 *     'UPDATE loans SET status = $1 WHERE id = $2',
 *     ['approved', loanId]
 *   );
 */
export async function execute(sql: string, params: any[] = []): Promise<number> {
  const result = await pool.query(sql, params);
  return result.rowCount ?? 0;
}

/**
 * Run multiple queries in a single transaction.
 *
 * @param callback Function that receives the client for executing queries
 * @returns The return value of the callback
 *
 * @example
 *   const result = await transaction(async (client) => {
 *     await client.query('UPDATE accounts SET balance = balance - $1 WHERE id = $2', [100, acc1]);
 *     await client.query('UPDATE accounts SET balance = balance + $1 WHERE id = $2', [100, acc2]);
 *     return { success: true };
 *   });
 */
export async function transaction<T>(
  callback: (client: any) => Promise<T>
): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await callback(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Get the underlying node-postgres Pool for advanced usage.
 *
 * Use this when you need direct access to the pool, e.g., for streaming results.
 */
export function getPool(): Pool {
  return pool;
}

/**
 * Close the connection pool (call on app shutdown).
 */
export async function closePool(): Promise<void> {
  await pool.end();
}

// ──────────────────────────────────────────────────────────────────────────────
// Default Export
// ──────────────────────────────────────────────────────────────────────────────

export default pool;

// ──────────────────────────────────────────────────────────────────────────────
// Type Definitions for convenience
// ──────────────────────────────────────────────────────────────────────────────

export type QueryParams = (string | number | boolean | null)[];

/**
 * Result from a query operation, matches pg module interface.
 */
export interface IQueryResult<T = any> extends QueryResult<T> {
  rows: T[];
  rowCount: number | null;
  command: string;
}
