// Test database helpers: a separate database (lms_test), recreated empty before each file.
import { Pool } from 'pg';

export const TEST_URL = process.env.DATABASE_URL!;

async function ensureDatabase() {
  const url = new URL(TEST_URL);
  const name = url.pathname.slice(1);
  url.pathname = '/postgres';
  const admin = new Pool({ connectionString: url.toString() });
  try {
    const { rowCount } = await admin.query('select 1 from pg_database where datname = $1', [name]);
    if (!rowCount) await admin.query(`create database "${name}"`);
  } finally {
    await admin.end();
  }
}

export async function emptyDatabase(pool: Pool) {
  await ensureDatabase();
  await pool.query('drop schema if exists drizzle cascade; drop schema if exists public cascade; create schema public;');
}
