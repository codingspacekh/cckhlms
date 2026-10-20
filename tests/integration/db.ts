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

// Waits until another query is waiting for a row lock, for tests of two people saving the same thing at once.
export async function untilBlocked(pool: Pool) {
  for (let i = 0; i < 50; i++) {
    const { rows } = await pool.query(
      `select count(*)::int as n from pg_stat_activity where datname = current_database() and wait_event_type = 'Lock'`,
    );
    if (rows[0].n > 0) return;
    await new Promise((r) => setTimeout(r, 20));
  }
}
