// Spike C (ADR-04): Better Auth with usernames, admin-created accounts, role-based sessions, rate limits.
// FR-AUTH-01/02/04/05/07/10/11 · runs against PostgreSQL in Docker (npm run db:up).
import { readFileSync } from 'node:fs';
import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { auth } from '@/server/auth';
import { getActor } from '@/server/actor';
import { seedUser } from '@/server/seed';

const LMS = 'http://lms.localhost:3101';
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const H = 3_600_000, M = 60_000, DAY = 24 * H;
let ipSeq = 1;
const freshIp = () => `198.51.100.${ipSeq++}`;

type CallOpts = { body?: unknown; cookie?: string; ip?: string; origin?: string; method?: string };
async function call(path: string, { body, cookie, ip = freshIp(), origin = LMS, method = 'POST' }: CallOpts = {}) {
  const headers = new Headers({ 'content-type': 'application/json', origin, 'cf-connecting-ip': ip });
  if (cookie) headers.set('cookie', cookie);
  return auth.handler(new Request(`${LMS}/api/auth${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) }));
}
const cookieOf = (res: Response) => res.headers.getSetCookie().map((c) => c.split(';')[0]).join('; ');
async function signIn(username: string, password: string, ip = freshIp()) {
  const res = await call('/sign-in/username', { body: { username, password }, ip });
  return { status: res.status, cookie: cookieOf(res) };
}
const headersWith = (cookie: string) => new Headers({ cookie, origin: LMS });
const tokenOf = (cookie: string) => decodeURIComponent(cookie.match(/session_token=([^;]+)/)![1]).split('.')[0];
async function setSessionTimes(cookie: string, createdAgo: number, idleAgo: number) {
  await pool.query(
    `update "session" set created_at = now() - make_interval(secs => $2::float / 1000), last_active_at = now() - make_interval(secs => $3::float / 1000) where token = $1`,
    [tokenOf(cookie), createdAgo, idleAgo],
  );
}

let adminCookie = '';
beforeAll(async () => {
  await pool.query(readFileSync('db/schema.sql', 'utf8'));
  await seedUser({ username: 'admin', name: 'Club Admin', password: 'admin-pass-1234', role: 'admin' });
  await seedUser({ username: 'sophea', name: 'Sophea Chan', password: 'teacher-pass-1234', role: 'teacher' });
  adminCookie = (await signIn('admin', 'admin-pass-1234')).cookie;
});
afterAll(() => pool.end());

describe('accounts', () => {
  it('has no public sign-up', async () => {
    const res = await call('/sign-up/email', { body: { email: 'kid@example.com', password: 'whatever-1234', name: 'Kid' } });
    expect(res.status).toBeGreaterThanOrEqual(400);
    const { rowCount } = await pool.query(`select 1 from "user" where email = 'kid@example.com'`);
    expect(rowCount).toBe(0);
  });

  it('lets Admin create a student who then signs in with a username', async () => {
    const res = await call('/admin/create-user', {
      cookie: adminCookie,
      body: { email: 'bopha.l@students.cckh.invalid', password: 'lotus-comet-42', name: 'Bopha Lim', role: 'student', data: { username: 'bopha.l' } },
    });
    expect(res.status).toBe(200);
    const s = await signIn('bopha.l', 'lotus-comet-42');
    expect(s.status).toBe(200);
    const actor = await getActor(headersWith(s.cookie));
    expect(actor).toMatchObject({ username: 'bopha.l', role: 'student' });
  });

  it('refuses account creation by a non-admin', async () => {
    const teacher = await signIn('sophea', 'teacher-pass-1234');
    const res = await call('/admin/create-user', {
      cookie: teacher.cookie,
      body: { email: 'x@students.cckh.invalid', password: 'xxxx-xxxx-12', name: 'X', role: 'student', data: { username: 'x.x' } },
    });
    expect(res.status).toBe(403);
  });

  it('stores passwords only as hashes', async () => {
    const { rows } = await pool.query(`select a.password from account a join "user" u on u.id = a.user_id where u.username = 'bopha.l'`);
    expect(rows[0].password).not.toContain('lotus-comet-42');
    expect(rows[0].password.length).toBeGreaterThan(40);
  });

  it('rejects sign-in requests sent from another site or a sandboxed frame', async () => {
    for (const origin of ['http://evil.localhost:3102', 'null']) {
      const res = await call('/sign-in/username', { origin, body: { username: 'bopha.l', password: 'lotus-comet-42' } });
      expect(res.status, `origin ${origin}`).toBe(403);
    }
  });
});

describe('sessions by role (FR-AUTH-10)', () => {
  it('signs a student out after 2 hours without activity, and deletes the session', async () => {
    const { cookie } = await signIn('bopha.l', 'lotus-comet-42');
    await setSessionTimes(cookie, 3 * H, 2 * H + M);
    expect(await getActor(headersWith(cookie))).toBeNull();
    const { rowCount } = await pool.query(`select 1 from "session" where token = $1`, [tokenOf(cookie)]);
    expect(rowCount).toBe(0);
  });

  it('signs a student out after 12 hours even when active', async () => {
    const { cookie } = await signIn('bopha.l', 'lotus-comet-42');
    await setSessionTimes(cookie, 12 * H + M, M);
    expect(await getActor(headersWith(cookie))).toBeNull();
  });

  it('keeps a teacher signed in for days while active', async () => {
    const { cookie } = await signIn('sophea', 'teacher-pass-1234');
    await setSessionTimes(cookie, 3 * DAY, H);
    expect(await getActor(headersWith(cookie))).toMatchObject({ role: 'teacher' });
  });

  it('signs a teacher out after 7 days without activity', async () => {
    const { cookie } = await signIn('sophea', 'teacher-pass-1234');
    await setSessionTimes(cookie, 8 * DAY, 7 * DAY + M);
    expect(await getActor(headersWith(cookie))).toBeNull();
  });

  it('records activity when the session is used', async () => {
    const { cookie } = await signIn('bopha.l', 'lotus-comet-42');
    await setSessionTimes(cookie, 30 * M, 10 * M);
    await getActor(headersWith(cookie));
    const { rows } = await pool.query(`select extract(epoch from now() - last_active_at) as idle from "session" where token = $1`, [tokenOf(cookie)]);
    expect(Number(rows[0].idle)).toBeLessThan(5);
  });

  it('lets Admin sign a user out everywhere at once', async () => {
    const a = await signIn('bopha.l', 'lotus-comet-42');
    const b = await signIn('bopha.l', 'lotus-comet-42');
    const { rows } = await pool.query(`select id from "user" where username = 'bopha.l'`);
    const res = await call('/admin/revoke-user-sessions', { cookie: adminCookie, body: { userId: rows[0].id } });
    expect(res.status).toBe(200);
    expect(await getActor(headersWith(a.cookie))).toBeNull();
    expect(await getActor(headersWith(b.cookie))).toBeNull();
  });
});

describe('brute force (FR-AUTH-11)', () => {
  it('refuses the 6th wrong password from the same address within a minute', async () => {
    const ip = freshIp();
    const statuses: number[] = [];
    for (let i = 0; i < 6; i++) statuses.push((await signIn('bopha.l', `wrong-${i}`, ip)).status);
    expect(statuses.slice(0, 5).every((s) => s === 401)).toBe(true);
    expect(statuses[5]).toBe(429);
  });

  it('does not block a different address', async () => {
    expect((await signIn('bopha.l', 'wrong-again', freshIp())).status).toBe(401);
  });
});
