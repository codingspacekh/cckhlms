// Fresh e2e database, the three test users, and a signed-in browser state for each (so tests rarely
// need the sign-in form, which is rate-limited).
import { mkdirSync, writeFileSync } from 'node:fs';
import { E2E } from '../../playwright.config';

export const USERS = {
  admin: { username: 'admin', password: 'admin-password-e2e', name: 'Club Admin', role: 'admin' },
  teacher: { username: 'sophea', password: 'teacher-password-e2e', name: 'Sophea Chan', role: 'teacher' },
  student: { username: 'bopha.l', password: 'student-password-e2e', name: 'Bopha Lim', role: 'student' },
} as const;
export const stateFile = (who: string) => `test-results/.auth/${who}.json`;

export default async function globalSetup() {
  Object.assign(process.env, { DATABASE_URL: E2E.databaseUrl, BETTER_AUTH_URL: E2E.lms, BETTER_AUTH_SECRET: E2E.secret });
  const { Pool } = await import('pg');
  const { emptyDatabase } = await import('../integration/db');
  const { startup } = await import('../../src/server/startup');
  const { seedUser } = await import('../../src/server/seed');
  const { pool: appPool } = await import('../../src/db/client');

  const pool = new Pool({ connectionString: E2E.databaseUrl });
  await emptyDatabase(pool);
  await pool.end();
  await startup({ bootstrapAdmin: { username: USERS.admin.username, password: USERS.admin.password } });
  await seedUser(USERS.teacher);
  await seedUser(USERS.student);

  mkdirSync('test-results/.auth', { recursive: true });
  const states: [string, (typeof USERS)[keyof typeof USERS]][] = [
    ['admin', USERS.admin],
    ['teacher', USERS.teacher],
    ['student', USERS.student],
    ['signout', USERS.teacher],
  ];
  let ip = 10;
  for (const [file, u] of states) await saveSignedInState(file, u.username, u.password, ip++);
  await appPool.end();
}

// Signs in through Better Auth's handler and saves the cookies as a Playwright storage state.
export async function saveSignedInState(file: string, username: string, password: string, ip: number) {
  const { auth } = await import('../../src/server/auth');
  const res = await auth.handler(
    new Request(`${E2E.lms}/api/auth/sign-in/username`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin: E2E.lms, 'cf-connecting-ip': `203.0.113.${ip}` },
      body: JSON.stringify({ username, password }),
    }),
  );
  if (res.status !== 200) throw new Error(`could not sign in ${username}: ${res.status}`);
  const cookies = res.headers.getSetCookie().map((c) => {
    const [pair] = c.split(';');
    const i = pair!.indexOf('=');
    return {
      name: pair!.slice(0, i),
      value: pair!.slice(i + 1),
      domain: 'lms.localhost',
      path: '/',
      expires: -1,
      httpOnly: true,
      secure: false,
      sameSite: 'Lax' as const,
    };
  });
  mkdirSync('test-results/.auth', { recursive: true });
  writeFileSync(stateFile(file), JSON.stringify({ cookies, origins: [] }));
}
