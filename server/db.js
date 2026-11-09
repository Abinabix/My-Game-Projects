import dotenv from 'dotenv';
import pg from 'pg';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = resolve(fileURLToPath(new URL('../', import.meta.url)));
dotenv.config({ path: resolve(projectRoot, '.env'), override: false });

const { Pool } = pg;

export class DatabaseConfigurationError extends Error {
  constructor(message) {
    super(message);
    this.name = 'DatabaseConfigurationError';
    this.code = 'DB_CONFIG';
    this.status = 503;
  }
}

export function validateDatabaseUrl(value = process.env.DATABASE_URL) {
  const connectionString = typeof value === 'string' ? value.trim() : '';
  if (!connectionString) {
    return 'DATABASE_URL is missing. Set it in the project-root .env file or the Render service environment.';
  }

  let parsed;
  try { parsed = new URL(connectionString); } catch {
    return 'DATABASE_URL is not a valid PostgreSQL connection URL. Copy the complete URL from Render PostgreSQL → Connect.';
  }
  if (!['postgres:', 'postgresql:'].includes(parsed.protocol) || !parsed.hostname || !parsed.pathname || parsed.pathname === '/') {
    return 'DATABASE_URL must be a PostgreSQL URL with a host and database name.';
  }

  let username = parsed.username;
  let password = parsed.password;
  let database = parsed.pathname.slice(1);
  try {
    username = decodeURIComponent(username);
    password = decodeURIComponent(password);
    database = decodeURIComponent(database);
  } catch {
    return 'DATABASE_URL contains invalid URL encoding. Copy the complete connection URL again.';
  }

  const hasPlaceholders = parsed.hostname.toLowerCase() === 'host'
    || username.toUpperCase() === 'USER'
    || password.toUpperCase() === 'PASSWORD'
    || database.toUpperCase() === 'DATABASE';
  if (hasPlaceholders) {
    return 'DATABASE_URL still contains template placeholders. Replace it with the real Render External Database URL for local use or Internal Database URL on Render.';
  }

  const isLoopback = ['localhost', '127.0.0.1', '::1'].includes(parsed.hostname.toLowerCase());
  const isPrivateNetworkHost = !parsed.hostname.includes('.') && !isLoopback;
  if (isPrivateNetworkHost && process.env.NODE_ENV !== 'production') {
    return 'This is a single-label/private-network PostgreSQL hostname that is not normally reachable from your computer. For local Render access, use the External Database URL.';
  }

  const sslmode = parsed.searchParams.get('sslmode');
  const isRenderExternal = parsed.hostname.toLowerCase().includes('postgres')
    && parsed.hostname.toLowerCase().endsWith('.render.com');
  if (isRenderExternal && !sslmode) {
    return 'Render external PostgreSQL requires TLS. Use the full External Database URL with sslmode=require.';
  }
  if (sslmode && !['disable', 'allow', 'prefer', 'require', 'verify-ca', 'verify-full', 'no-verify'].includes(sslmode)) {
    return 'DATABASE_URL has an unsupported sslmode value. Use the complete URL supplied by Render.';
  }
  if (sslmode === 'no-verify') {
    return 'DATABASE_URL disables PostgreSQL certificate verification. Remove no-verify and use Render’s complete external URL with its SSL mode.';
  }
  if (sslmode === 'disable' && !['localhost', '127.0.0.1', '::1'].includes(parsed.hostname.toLowerCase())) {
    return 'DATABASE_URL disables TLS for a remote database. Use Render’s full external URL with its SSL mode.';
  }
  return null;
}

export const databaseConfigurationError = validateDatabaseUrl();

export function assertDatabaseConfigured() {
  if (databaseConfigurationError) throw new DatabaseConfigurationError(databaseConfigurationError);
}

export function safeDatabaseError(error) {
  if (error instanceof DatabaseConfigurationError || error?.code === 'DB_CONFIG') return error.message;
  const code = error?.code || error?.cause?.code;
  if (code === 'ENOTFOUND' || code === 'EAI_AGAIN') {
    return 'PostgreSQL host lookup failed. Copy the full Render External Database URL for local use; do not leave HOST or another template value in DATABASE_URL.';
  }
  if (code === 'ECONNREFUSED') return 'PostgreSQL refused the connection. Check that the database is available and that DATABASE_URL is the correct Render URL.';
  if (code === 'ETIMEDOUT' || code === 'ECONNRESET') return 'PostgreSQL connection timed out or reset. Check database availability and the Render external IP allow list.';
  if (code === '28P01') return 'PostgreSQL rejected the credentials. Copy a fresh connection URL from the Render database Connect page.';
  if (code === '28000') return 'PostgreSQL rejected the connection policy. For Render External Database URLs, require TLS with sslmode=require and check the database external IP allow list.';
  if (code === '3D000') return 'The PostgreSQL database name was not found. Copy the complete connection URL from Render.';
  if (['CERT_HAS_EXPIRED', 'UNABLE_TO_VERIFY_LEAF_SIGNATURE', 'SELF_SIGNED_CERT_IN_CHAIN', 'DEPTH_ZERO_SELF_SIGNED_CERT'].includes(code)) {
    return 'PostgreSQL TLS certificate verification failed. Use Render’s full external URL with its sslmode parameter; certificate verification is enabled.';
  }
  if (code) return `PostgreSQL operation failed (code ${String(code).slice(0, 32)}). Check the database and migration configuration.`;
  return 'PostgreSQL operation failed. Check DATABASE_URL and the database logs.';
}

class UnconfiguredPool {
  on() { return this; }
  query(_text, _values, callback) {
    const promise = Promise.reject(new DatabaseConfigurationError(databaseConfigurationError));
    if (typeof callback === 'function') promise.catch(callback);
    return promise;
  }
  connect() { return Promise.reject(new DatabaseConfigurationError(databaseConfigurationError)); }
  end() { return Promise.resolve(); }
}

const poolSize = Number.parseInt(process.env.PGPOOL_MAX || '10', 10);
export const pool = databaseConfigurationError ? new UnconfiguredPool() : new Pool({
  connectionString: process.env.DATABASE_URL.trim(),
  max: Number.isInteger(poolSize) && poolSize > 0 ? poolSize : 10,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 10_000,
  // SSL is parsed from the URL (for example Render's sslmode=require). We do not
  // override certificate verification with rejectUnauthorized:false here.
});

if (!databaseConfigurationError) {
  pool.on('error', (error) => {
    const code = error?.code ? ` (${String(error.code).slice(0, 32)})` : '';
    console.error(`Unexpected PostgreSQL pool error${code}.`);
  });
}

export async function query(text, values) {
  assertDatabaseConfigured();
  return pool.query(text, values);
}

export async function checkDatabaseConnection() {
  assertDatabaseConfigured();
  const client = await pool.connect();
  try { await client.query('SELECT 1'); }
  finally { client.release(); }
}

export async function transaction(work) {
  assertDatabaseConfigured();
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const value = await work(client);
    await client.query('COMMIT');
    return value;
  } catch (error) {
    try { await client.query('ROLLBACK'); } catch {}
    throw error;
  } finally {
    client.release();
  }
}
