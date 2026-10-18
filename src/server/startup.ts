// Runs once when the server starts (src/instrumentation.ts): migrations, the club settings row,
// and the first admin if there is none yet.
import { like } from 'drizzle-orm';
import { db } from '@/db/client';
import { runMigrations } from '@/db/migrate';
import { clubSettings, user } from '@/db/schema';
import { seedUser } from './seed';

type Bootstrap = { username: string; password: string } | null;

function bootstrapFromEnv(): Bootstrap {
  const { BOOTSTRAP_ADMIN_USERNAME: username, BOOTSTRAP_ADMIN_PASSWORD: password } = process.env;
  return username && password ? { username, password } : null;
}

export async function startup(opts: { bootstrapAdmin?: Bootstrap } = {}) {
  const bootstrap = opts.bootstrapAdmin !== undefined ? opts.bootstrapAdmin : bootstrapFromEnv();
  if (bootstrap && bootstrap.password.length < 12) throw new Error('The first admin password must be at least 12 characters.');
  await runMigrations();
  await db.insert(clubSettings).values({ id: 1 }).onConflictDoNothing();
  if (bootstrap) {
    const admins = await db.select({ id: user.id }).from(user).where(like(user.role, '%admin%')).limit(1);
    if (admins.length === 0) await seedUser({ ...bootstrap, name: 'Club Admin', role: 'admin' });
  }
}

// Called from instrumentation. If start-up fails, exit so Docker restarts the container and the health
// check shows the problem, instead of every request failing on a half-started server.
export async function startupOrExit() {
  try {
    await startup();
  } catch (err) {
    console.error('Start-up failed:', err);
    process.exit(1);
  }
}
