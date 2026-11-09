import pg from 'pg';

const { Pool } = pg;

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: Number.parseInt(process.env.PGPOOL_MAX || '10', 10),
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 10_000,
});

pool.on('error', (error) => console.error('Unexpected PostgreSQL pool error:', error));

export const query = (text, values) => pool.query(text, values);

export async function transaction(work) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const value = await work(client);
    await client.query('COMMIT');
    return value;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}
