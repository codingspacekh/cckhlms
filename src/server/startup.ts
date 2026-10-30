// Runs once when the server starts (src/instrumentation.ts): the settings check, migrations, the club
// settings row, the first admin if there is none yet, and a lost admin password reset from the server's .env.
import { like } from 'drizzle-orm';
import { db, pool } from '@/db/client';
import { runMigrations } from '@/db/migrate';
import { clubSettings, user } from '@/db/schema';
import { resetAdminPasswordFromServer } from '@/modules/identity/service';
import { configProblems } from './config';
import { seedUser } from './seed';

type Bootstrap = { username: string; password: string } | null;
const STARTUP_LOCK = 724_519_001; // any fixed number, the same in every process

function bootstrapFromEnv(): Bootstrap {
  const { BOOTSTRAP_ADMIN_USERNAME: username, BOOTSTRAP_ADMIN_PASSWORD: password } = process.env;
  return username && password ? { username, password } : null;
}

function adminResetFromEnv(): Bootstrap {
  const { ADMIN_RESET_USERNAME: username, ADMIN_RESET_PASSWORD: password } = process.env;
  return username && password ? { username, password } : null;
}

export async function startup(opts: { bootstrapAdmin?: Bootstrap; adminReset?: Bootstrap } = {}) {
  const problems = configProblems(process.env);
  if (problems.length) throw new Error(`The server settings need fixing:\n- ${problems.join('\n- ')}`);
  const bootstrap = opts.bootstrapAdmin !== undefined ? opts.bootstrapAdmin : bootstrapFromEnv();
  const adminReset = opts.adminReset !== undefined ? opts.adminReset : adminResetFromEnv();
  if (bootstrap && bootstrap.password.length < 12) throw new Error('The first admin password must be at least 12 characters.');
  // The app runs one server process per CPU (M7), and they start together: one at a time does the database part.
  const lock = await pool.connect();
  try {
    await lock.query('select pg_advisory_lock($1)', [STARTUP_LOCK]);
    await runMigrations();
    await db.insert(clubSettings).values({ id: 1 }).onConflictDoNothing();
    if (bootstrap) {
      const admins = await db.select({ id: user.id }).from(user).where(like(user.role, '%admin%')).limit(1);
      if (admins.length === 0) await seedUser({ ...bootstrap, name: 'Club Admin', role: 'admin' });
    }
    // A mistake here is logged, not fatal: the site stays up and the owner reads the reason in the app's log.
    if (adminReset) {
      const outcome = await resetAdminPasswordFromServer(adminReset);
      if (outcome === 'reset') console.log(`Admin password reset for ${adminReset.username}. Now remove ADMIN_RESET_* from .env.`);
      else if (outcome !== 'unchanged') console.error(`Admin password reset skipped: ${outcome}`);
    }
  } finally {
    await lock.query('select pg_advisory_unlock($1)', [STARTUP_LOCK]).catch(() => undefined);
    lock.release();
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
