// Start-up: migrations, club settings (FR-ADM-16) and the first admin (docs/05 M1).
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Pool } from 'pg';
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { pool as appPool } from '@/db/client';
import { startup, startupOrExit } from '@/server/startup';
import { emptyDatabase, TEST_URL } from './db';

const pool = new Pool({ connectionString: TEST_URL });
beforeEach(() => emptyDatabase(pool));
afterAll(async () => {
  await pool.end();
  await appPool.end();
});

const tables = async () =>
  (await pool.query(`select table_name from information_schema.tables where table_schema = 'public' order by 1`)).rows.map(
    (r) => r.table_name,
  );

describe('startup', () => {
  it('creates every table on an empty database', async () => {
    await startup({ bootstrapAdmin: null });
    expect(await tables()).toEqual([
      'account',
      'assessment',
      'attendance',
      'audit_log',
      'certificate',
      'class',
      'class_report',
      'class_report_topic',
      'class_session',
      'class_teacher',
      'club_settings',
      'course',
      'enrolment',
      'excusal',
      'lesson',
      'lesson_attachment',
      'lesson_topic',
      'notification_seen',
      'playground_project',
      'post_report',
      'question',
      'rate_limit',
      'reply',
      'session',
      'sign_in_failure',
      'student_profile',
      'student_report',
      'submission',
      'syllabus_topic',
      'teacher_profile',
      'term',
      'user',
      'verification',
      'work_draft',
    ]);
  });

  it('is safe to run on every start', async () => {
    await startup({ bootstrapAdmin: null });
    await expect(startup({ bootstrapAdmin: null })).resolves.toBeUndefined();
  });

  // M7: the app runs one server process per CPU, and they all start at once.
  it('is safe when several server processes start at the same time', async () => {
    const admin = { username: 'admin', password: 'admin-password-123' };
    await Promise.all([startup({ bootstrapAdmin: admin }), startup({ bootstrapAdmin: admin }), startup({ bootstrapAdmin: admin })]);
    const journal = JSON.parse(readFileSync(join(process.cwd(), 'drizzle/meta/_journal.json'), 'utf8')) as { entries: unknown[] };
    expect((await pool.query(`select count(*)::int as n from drizzle.__drizzle_migrations`)).rows[0].n).toBe(journal.entries.length);
    expect((await pool.query(`select count(*)::int as n from "user" where role = 'admin'`)).rows[0].n).toBe(1);
    expect((await pool.query(`select count(*)::int as n from club_settings`)).rows[0].n).toBe(1);
  });

  it('stores the club time zone, Asia/Phnom_Penh by default', async () => {
    await startup({ bootstrapAdmin: null });
    const { rows } = await pool.query('select club_name, time_zone from club_settings');
    expect(rows).toEqual([{ club_name: 'CCKH Coding Club', time_zone: 'Asia/Phnom_Penh' }]);
  });

  it('creates the first admin when there is none yet', async () => {
    await startup({ bootstrapAdmin: { username: 'admin', password: 'first-admin-password' } });
    const { rows } = await pool.query(`select username, role from "user"`);
    expect(rows).toEqual([{ username: 'admin', role: 'admin' }]);
  });

  it('never creates a second admin or changes the password on later starts', async () => {
    await startup({ bootstrapAdmin: { username: 'admin', password: 'first-admin-password' } });
    await startup({ bootstrapAdmin: { username: 'admin2', password: 'another-password-123' } });
    const { rows } = await pool.query(`select username from "user" where role like '%admin%'`);
    expect(rows).toEqual([{ username: 'admin' }]);
  });

  it('refuses a short first-admin password', async () => {
    await expect(startup({ bootstrapAdmin: { username: 'admin', password: 'short' } })).rejects.toThrow(/at least 12/);
  });
});

describe('start-up settings from the server environment', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it('reads the first admin from BOOTSTRAP_ADMIN_USERNAME and BOOTSTRAP_ADMIN_PASSWORD', async () => {
    vi.stubEnv('BOOTSTRAP_ADMIN_USERNAME', 'owner');
    vi.stubEnv('BOOTSTRAP_ADMIN_PASSWORD', 'owner-password-1234');
    await startup();
    expect((await pool.query(`select username from "user"`)).rows).toEqual([{ username: 'owner' }]);
  });

  it('creates no admin when those settings are missing', async () => {
    vi.stubEnv('BOOTSTRAP_ADMIN_USERNAME', '');
    vi.stubEnv('BOOTSTRAP_ADMIN_PASSWORD', '');
    await startup();
    expect((await pool.query(`select count(*)::int as n from "user"`)).rows[0].n).toBe(0);
  });

  it('refuses to start in production with unsafe settings, before touching the database', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('BETTER_AUTH_SECRET', 'change-me-to-32-or-more-random-characters');
    await expect(startup({ bootstrapAdmin: null })).rejects.toThrow(/BETTER_AUTH_SECRET is still the example value/);
    expect(await tables()).toEqual([]);
  });

  it('exits the process when start-up fails, so Docker restarts it', async () => {
    vi.stubEnv('BOOTSTRAP_ADMIN_USERNAME', 'owner');
    vi.stubEnv('BOOTSTRAP_ADMIN_PASSWORD', 'short');
    const exit = vi.spyOn(process, 'exit').mockImplementation((() => undefined) as never);
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    await startupOrExit();
    expect(exit).toHaveBeenCalledWith(1);
  });
});
