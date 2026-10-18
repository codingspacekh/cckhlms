import path from 'node:path';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { db } from './client';

// Forward-only migrations from ./drizzle (copied into the Docker image next to the app).
export async function runMigrations() {
  await migrate(db, { migrationsFolder: path.join(process.cwd(), 'drizzle') });
}
