// Better Auth (ADR 0003): usernames, admin-created accounts, role-based sessions, rate limits, audit.
// FR-AUTH-01/02/04/05/07/10/11 · NFR-11 · runs against PostgreSQL (npm run db:up).
import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { auth } from '@/server/auth';
import { getActor } from '@/server/actor';
import { signOutEverywhere } from '@/modules/identity/service';
import { seedUser } from '@/server/seed';
import { startup } from '@/server/startup';
import { pool as appPool } from '@/db/client';
import { emptyDatabase } from './db';

const LMS = process.env.BETTER_AUTH_URL!;
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const H = 3_600_000,
  M = 60_000,
  DAY = 24 * H;
let ipSeq = 1;
const freshIp = () => `198.51.100.${ipSeq++}`;

type CallOpts = { body?: unknown; cookie?: string; ip?: string; origin?: string; method?: string };
async function call(path: string, { body, cookie, ip = freshIp(), origin = LMS, method = 'POST' }: CallOpts = {}) {
  const headers = new Headers({ 'content-type': 'application/json', origin, 'cf-connecting-ip': ip });
  if (cookie) headers.set('cookie', cookie);
  return auth.handler(
    new Request(`${LMS}/api/auth${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) }),
  );
}
const cookieOf = (res: Response) =>
  res.headers
    .getSetCookie()
    .map((c) => c.split(';')[0])
    .join('; ');
async function signIn(username: string, password: string, ip = freshIp()) {
  const res = await call('/sign-in/username', { body: { username, password }, ip });
  return { status: res.status, cookie: cookieOf(res) };
}
const headersWith = (cookie: string) => new Headers({ cookie, origin: LMS });
const tokenOf = (cookie: string) => decodeURIComponent(cookie.match(/session_token=([^;]+)/)![1]!).split('.')[0]!;
async function setSessionTimes(cookie: string, createdAgo: number, idleAgo: number) {
  await pool.query(
    `update "session" set created_at = now() - make_interval(secs => $2::float / 1000), last_active_at = now() - make_interval(secs => $3::float / 1000) where token = $1`,
    [tokenOf(cookie), createdAgo, idleAgo],
  );
}

let adminCookie = '';
beforeAll(async () => {
  await emptyDatabase(pool);
  await startup({ bootstrapAdmin: null });
  await seedUser({ username: 'admin', name: 'Club Admin', password: 'admin-pass-1234', role: 'admin' });
  await seedUser({ username: 'sophea', name: 'Sophea Chan', password: 'teacher-pass-1234', role: 'teacher' });
  adminCookie = (await signIn('admin', 'admin-pass-1234')).cookie;
});
afterAll(async () => {
  await pool.end();
  await appPool.end();
});

describe('accounts', () => {
  it('has no public sign-up', async () => {
    const res = await call('/sign-up/email', { body: { email: 'kid@example.com', password: 'whatever-1234', name: 'Kid' } });
    expect(res.status).toBeGreaterThanOrEqual(400);
    const { rowCount } = await pool.query(`select 1 from "user" where email = 'kid@example.com'`);
    expect(rowCount).toBe(0);
  });

  it('lets a student created by Admin sign in with a username', async () => {
    await seedUser({ username: 'bopha.l', name: 'Bopha Lim', password: 'lotus-comet-42', role: 'student' });
    const s = await signIn('bopha.l', 'lotus-comet-42');
    expect(s.status).toBe(200);
    const actor = await getActor(headersWith(s.cookie));
    expect(actor).toMatchObject({ username: 'bopha.l', role: 'student' });
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

// Pre-launch review finding 1: Better Auth serves ~40 endpoints; the LMS uses three. The rest are refused, so a
// student can't rename themselves (certificates), sign in by email past FR-AUTH-11, or reach the admin plugin.
describe('only the auth endpoints the LMS uses', () => {
  it('refuses every other endpoint, whoever calls it', async () => {
    const student = await signIn('bopha.l', 'lotus-comet-42');
    const refused: [string, unknown][] = [
      ['/update-user', { name: 'Someone Else', username: 'someone.else' }],
      ['/change-password', { currentPassword: 'lotus-comet-42', newPassword: 'aaaaaaaaaa' }],
      ['/is-username-available', { username: 'admin' }],
      ['/sign-in/email', { email: 'bopha.l@users.cckh.invalid', password: 'lotus-comet-42' }],
      ['/admin/create-user', { email: 'x@users.cckh.invalid', password: 'xxxx-xxxx-12', name: 'X', role: 'student' }],
      ['/admin/set-role', { userId: 'x', role: 'admin' }],
      ['/admin/impersonate-user', { userId: 'x' }],
      ['/admin/remove-user', { userId: 'x' }],
    ];
    for (const cookie of [student.cookie, adminCookie, undefined])
      for (const [path, body] of refused) {
        const res = await call(path, { cookie, body });
        expect(res.status, `${path} ${cookie ? 'signed in' : 'anonymous'}`).toBe(404);
      }
    expect((await call('/list-sessions', { cookie: student.cookie, method: 'GET' })).status).toBe(404);
    const { rows } = await pool.query(`select name, username from "user" where username = 'bopha.l'`);
    expect(rows).toEqual([{ name: 'Bopha Lim', username: 'bopha.l' }]);
  });

  it('still signs in by username, reads the session and signs out', async () => {
    const s = await signIn('bopha.l', 'lotus-comet-42');
    expect(s.status).toBe(200);
    const got = await call('/get-session', { cookie: s.cookie, method: 'GET' });
    expect(got.status).toBe(200);
    expect(await got.json()).toMatchObject({ user: { username: 'bopha.l' } });
    expect((await call('/sign-out', { cookie: s.cookie, body: {} })).status).toBe(200);
    expect(await getActor(headersWith(s.cookie))).toBeNull();
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

  it('treats a session with no recorded activity as active since it was created', async () => {
    const { cookie } = await signIn('bopha.l', 'lotus-comet-42');
    await pool.query(`update "session" set created_at = now() - interval '3 hours', last_active_at = null where token = $1`, [
      tokenOf(cookie),
    ]);
    expect(await getActor(headersWith(cookie))).toBeNull(); // 3 h since creation > 2 h student idle limit
  });

  it('records activity when the session is used', async () => {
    const { cookie } = await signIn('bopha.l', 'lotus-comet-42');
    await setSessionTimes(cookie, 30 * M, 10 * M);
    await getActor(headersWith(cookie));
    const { rows } = await pool.query(`select extract(epoch from now() - last_active_at) as idle from "session" where token = $1`, [
      tokenOf(cookie),
    ]);
    expect(Number(rows[0].idle)).toBeLessThan(5);
  });

  // Pre-launch review: switching an account off deletes its sessions; this is the second guard if that ever fails.
  it('refuses a switched-off account even if a session survived', async () => {
    const s = await signIn('bopha.l', 'lotus-comet-42');
    await pool.query(`update "user" set banned = true where username = 'bopha.l'`);
    try {
      expect(await getActor(headersWith(s.cookie))).toBeNull();
    } finally {
      await pool.query(`update "user" set banned = false where username = 'bopha.l'`);
    }
  });

  it('lets Admin sign a user out everywhere at once', async () => {
    const a = await signIn('bopha.l', 'lotus-comet-42');
    const b = await signIn('bopha.l', 'lotus-comet-42');
    const { rows } = await pool.query(`select id from "user" where username = 'bopha.l'`);
    await signOutEverywhere(await getActor(headersWith(adminCookie)), rows[0].id);
    expect(await getActor(headersWith(a.cookie))).toBeNull();
    expect(await getActor(headersWith(b.cookie))).toBeNull();
  });
});

// Only failed tries count, so a whole class can sign in together from the club's one Wi-Fi address; a username
// and an address each have their own limit (M7), so guessing is slow from one address or from many.
describe('brute force (FR-AUTH-11)', () => {
  it('refuses a username after 5 failed tries in a minute, from any address', async () => {
    for (let i = 0; i < 5; i++) expect((await signIn('sophea', `wrong-${i}`)).status).toBe(401);
    const res = await call('/sign-in/username', { body: { username: 'Sophea', password: 'teacher-pass-1234' } });
    expect(res.status).toBe(429);
    expect((await res.json()).message).toBe('Too many tries for this username. Wait a minute and try again.');
  });

  it('lets the username try again a minute later', async () => {
    await pool.query(`update sign_in_failure set window_start = window_start - interval '61 seconds' where key = 'user:sophea'`);
    expect((await signIn('sophea', 'teacher-pass-1234')).status).toBe(200);
  });

  it('forgets a username’s failed tries once the right password is used', async () => {
    for (let i = 0; i < 4; i++) expect((await signIn('sophea', `wrong-${i}`)).status).toBe(401);
    expect((await signIn('sophea', 'teacher-pass-1234')).status).toBe(200);
    for (let i = 0; i < 4; i++) expect((await signIn('sophea', `wrong-${i}`)).status).toBe(401);
  });

  it('refuses an address after 10 failed tries in a minute, whatever the usernames', async () => {
    const ip = freshIp();
    for (let i = 0; i < 10; i++) expect((await signIn(`nobody${i}`, 'guess-1234', ip)).status).toBe(401);
    expect((await signIn('admin', 'admin-pass-1234', ip)).status).toBe(429);
    expect((await signIn('admin', 'admin-pass-1234', freshIp())).status).toBe(200);
  });

  it('doesn’t let a right password clear the address’s count', async () => {
    const ip = freshIp();
    for (let i = 0; i < 9; i++) await signIn(`nobody${i}`, 'guess-1234', ip);
    expect((await signIn('admin', 'admin-pass-1234', ip)).status).toBe(200);
    expect((await signIn('nobody9', 'guess-1234', ip)).status).toBe(401);
    expect((await signIn('nobody10', 'guess-1234', ip)).status).toBe(429);
  });

  it('counts IPv6 addresses per /64, so moving inside one connection doesn’t reset the count', async () => {
    for (let i = 1; i <= 10; i++) await signIn(`nobody${i}`, 'wrong-password', `2001:db8:77:1::${i}`);
    expect((await signIn('sophea', 'teacher-pass-1234', '2001:db8:77:1::ff')).status).toBe(429);
    expect((await signIn('sophea', 'teacher-pass-1234', '2001:db8:77:2::1')).status).toBe(200);
  });

  it('forgets failed sign-ins (usernames and addresses) after a day', async () => {
    await pool.query(`insert into sign_in_failure (key, count, window_start) values ('ip:192.0.2.250', 3, now() - interval '25 hours')`);
    await pool.query(`insert into rate_limit (id, key, count, last_request) values ('old', '192.0.2.250/sign-in/username', 1, $1)`, [
      Date.now() - 25 * H,
    ]);
    await signIn('nobody', 'wrong-password');
    expect((await pool.query(`select 1 from sign_in_failure where key = 'ip:192.0.2.250'`)).rowCount).toBe(0);
    expect((await pool.query(`select 1 from rate_limit where id = 'old'`)).rowCount).toBe(0);
  });

  it('lets a class of 30 sign in together from one address, with a few typos', async () => {
    const ip = freshIp();
    const kids = Array.from({ length: 30 }, (_, i) => ({ username: `kid${i}`, password: `kid-pass-${1000 + i}` }));
    for (const k of kids) await seedUser({ ...k, name: `Kid ${k.username}`, role: 'student' });
    for (const k of kids.slice(0, 3)) expect((await signIn(k.username, 'typo-typo', ip)).status).toBe(401);
    const statuses = await Promise.all(kids.map((k) => signIn(k.username, k.password, ip).then((r) => r.status)));
    expect(statuses.filter((st) => st !== 200)).toEqual([]);
  });
});

describe('audit log (NFR-11)', () => {
  it('records each sign-in with who and from which address', async () => {
    const ip = freshIp();
    await signIn('sophea', 'teacher-pass-1234', ip);
    const { rows } = await pool.query(
      `select a.action, a.ip, u.username from audit_log a join "user" u on u.id = a.actor_id where a.action = 'auth.sign_in' order by a.id desc limit 1`,
    );
    expect(rows[0]).toEqual({ action: 'auth.sign_in', ip, username: 'sophea' });
  });

  it('records why a session was ended by the session rules', async () => {
    const { cookie } = await signIn('bopha.l', 'lotus-comet-42');
    await setSessionTimes(cookie, 3 * H, 2 * H + M);
    await getActor(headersWith(cookie));
    const { rows } = await pool.query(`select detail from audit_log where action = 'auth.session_expired' order by id desc limit 1`);
    expect(rows[0].detail).toEqual({ reason: 'idle', role: 'student' });
  });
});
