// Profile pictures (owner, 2026-10-31): anyone signed in can set their own (up to 5 MB, PNG, JPEG or WebP) on My account,
// or remove it. Their own browser and the club's staff can open it; other students can't. Deleting a student's
// personal data deletes it.
import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { pool as appPool } from '@/db/client';
import { openAvatar, removeAvatar, setAvatar } from '@/modules/identity/avatar';
import { createAccount } from '@/modules/identity/service';
import { eraseStudent } from '@/modules/privacy/erase';
import type { Actor } from '@/server/actor';
import { ForbiddenError, ValidationError } from '@/server/errors';
import { startup } from '@/server/startup';
import { storage } from '@/server/storage';
import { emptyDatabase } from './db';

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const admin: Actor = { userId: '', username: 'admin', name: 'Admin', role: 'admin', sessionId: 's' };
let sophea: Actor, bopha: Actor, chenda: Actor;
const png = (n = 1) => new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, n, n, n]);
const imageOf = async (a: Actor) => (await pool.query(`select image from "user" where id = $1`, [a.userId])).rows[0].image as string | null;

beforeAll(async () => {
  await emptyDatabase(pool);
  await startup({ bootstrapAdmin: { username: 'admin', password: 'admin-password-123' } });
  admin.userId = (await pool.query(`select id from "user" where username = 'admin'`)).rows[0].id;
  const person = async (role: 'teacher' | 'student', name: string): Promise<Actor> => {
    const r = await createAccount(admin, { role, name });
    return { userId: r.userId, username: r.username, name, role, sessionId: 's' };
  };
  sophea = await person('teacher', 'Sophea Chan');
  bopha = await person('student', 'Bopha Lim');
  chenda = await person('student', 'Chenda Ouk');
});
afterAll(async () => {
  await pool.end();
  await appPool.end();
});

describe('setting a profile picture', () => {
  it('keeps it on the uploads volume; a new one replaces the old', async () => {
    await setAvatar(bopha, png(1));
    const first = await imageOf(bopha);
    expect(new Uint8Array((await storage.get(first!))!)).toEqual(png(1));
    await setAvatar(bopha, png(2));
    const second = await imageOf(bopha);
    expect(second).not.toBe(first);
    expect(await storage.get(first!)).toBeNull();
    expect((await pool.query(`select count(*)::int as n from audit_log where action = 'account.picture'`)).rows[0].n).toBe(2);
  });

  it('only a PNG, JPEG or WebP picture, up to 5 MB, and not empty', async () => {
    await expect(setAvatar(chenda, new TextEncoder().encode('<svg/>'))).rejects.toThrow('Use a PNG, JPEG or WebP picture.');
    const big = new Uint8Array(5 * 1024 * 1024 + 1);
    big.set(png(), 0);
    await expect(setAvatar(chenda, big)).rejects.toThrow('That picture is bigger than 5 MB.');
    await expect(setAvatar(null, png())).rejects.toBeInstanceOf(ForbiddenError);
  });

  it('can be removed, back to the gradient', async () => {
    await setAvatar(sophea, png(3));
    const key = await imageOf(sophea);
    await removeAvatar(sophea);
    expect(await imageOf(sophea)).toBeNull();
    expect(await storage.get(key!)).toBeNull();
  });
});

describe('opening one', () => {
  it('for the person themselves and the club’s staff; not other students, not someone signed out', async () => {
    for (const who of [bopha, sophea, admin]) {
      const a = await openAvatar(who, bopha.userId);
      expect([a.contentType, new Uint8Array(a.data)]).toEqual(['image/png', png(2)]);
    }
    await expect(openAvatar(chenda, bopha.userId)).rejects.toBeInstanceOf(ForbiddenError);
    await expect(openAvatar(null, bopha.userId)).rejects.toBeInstanceOf(ForbiddenError);
    await expect(openAvatar(sophea, chenda.userId)).rejects.toBeInstanceOf(ValidationError); // none set
  });
});

describe('privacy (NFR-07)', () => {
  it('deleting a student’s personal data deletes their picture', async () => {
    const key = await imageOf(bopha);
    await eraseStudent(admin, bopha.userId, bopha.username);
    expect(await imageOf(bopha)).toBeNull();
    expect(await storage.get(key!)).toBeNull();
  });
});
