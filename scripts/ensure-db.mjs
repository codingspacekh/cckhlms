// Creates the database named in DATABASE_URL if it doesn't exist yet (tests, CI, first local run).
import pg from 'pg';

const url = new URL(process.env.DATABASE_URL ?? '');
const name = decodeURIComponent(url.pathname.slice(1));
if (!/^[a-z0-9_]+$/.test(name)) throw new Error(`unexpected database name: ${name}`);
url.pathname = '/postgres';
const client = new pg.Client({ connectionString: url.toString() });
await client.connect();
const { rowCount } = await client.query('select 1 from pg_database where datname = $1', [name]);
if (!rowCount) await client.query(`create database "${name}"`);
await client.end();
console.log(rowCount ? `database ${name} exists` : `created database ${name}`);
