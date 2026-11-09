import 'dotenv/config';
import { readdir, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { pool } from '../db.js';

const projectRoot = resolve(fileURLToPath(new URL('../..', import.meta.url)));
const migrationDir = resolve(projectRoot, 'migrations');

export async function runMigrations() {
  const client = await pool.connect();
  try {
    await client.query('SELECT pg_advisory_lock($1)', [847230194]);
    await client.query('CREATE TABLE IF NOT EXISTS schema_migrations (name TEXT PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW())');
    const alreadyApplied = new Set((await client.query('SELECT name FROM schema_migrations')).rows.map((row) => row.name));
    const migrations = (await readdir(migrationDir)).filter((name) => /^\d+_[a-z0-9_-]+\.sql$/i.test(name)).sort();
    for (const name of migrations) {
      if (alreadyApplied.has(name)) continue;
      const sql = await readFile(resolve(migrationDir, name), 'utf8');
      await client.query('BEGIN');
      try {
        await client.query(sql);
        await client.query('INSERT INTO schema_migrations (name) VALUES ($1)', [name]);
        await client.query('COMMIT');
        console.info(`Applied migration ${name}`);
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      }
    }
  } finally {
    try { await client.query('SELECT pg_advisory_unlock($1)', [847230194]); } catch {}
    client.release();
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  runMigrations().then(() => pool.end()).catch(async (error) => {
    console.error('Database migrations failed:', error);
    await pool.end();
    process.exitCode = 1;
  });
}
