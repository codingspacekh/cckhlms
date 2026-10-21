// FR-CODE-07: the Playground. Students keep their own projects outside any class: start one from a language's
// template, save it as they type (with the same project limits as work), rename and delete it. Nobody else can
// open it, not even to learn that it exists.
import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { pool as appPool } from '@/db/client';
import { LIMITS } from '@/lib/project/files';
import { createAccount, setActive } from '@/modules/identity/service';
import {
  createProject,
  deleteProject,
  myProjects,
  openProject,
  PLAYGROUND_LIMIT,
  renameProject,
  saveProject,
} from '@/modules/playground/playground';
import type { Actor } from '@/server/actor';
import { ForbiddenError } from '@/server/errors';
import { startup } from '@/server/startup';
import { emptyDatabase } from './db';

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const admin: Actor = { userId: '', username: 'admin', name: 'Admin', role: 'admin', sessionId: 's' };
let sophea: Actor, bopha: Actor, chenda: Actor;
const one = async (sql: string, params: unknown[] = []) => (await pool.query(sql, params)).rows[0];

beforeAll(async () => {
  await emptyDatabase(pool);
  await startup({ bootstrapAdmin: { username: 'admin', password: 'admin-password-123' } });
  admin.userId = (await one(`select id from "user" where username = 'admin'`)).id;
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

describe('starting a project', () => {
  it('starts from the language’s template and lists it, newest first', async () => {
    const web = await createProject(bopha, { name: '  My first page ', language: 'web' });
    const py = await createProject(bopha, { name: 'Guessing game', language: 'python' });
    expect((await openProject(bopha, web)).files.map((f) => f.path)).toEqual(['index.html', 'script.js', 'style.css']);
    expect(await openProject(bopha, py)).toMatchObject({ name: 'Guessing game', language: 'python', files: [{ path: 'main.py' }] });
    expect((await myProjects(bopha)).map((p) => [p.name, p.language, p.files])).toEqual([
      ['Guessing game', 'python', 1],
      ['My first page', 'web', 3],
    ]);
    expect(await myProjects(chenda)).toEqual([]);
  });

  it('needs a name that isn’t taken, and a language with files', async () => {
    await expect(createProject(bopha, { name: '   ', language: 'python' })).rejects.toThrow('Give the project a name.');
    await expect(createProject(bopha, { name: 'x'.repeat(61), language: 'python' })).rejects.toThrow('Keep the name under 60 characters.');
    await expect(createProject(bopha, { name: 'GUESSING GAME', language: 'java' })).rejects.toThrow(
      'You already have a project called GUESSING GAME.',
    );
    await expect(createProject(bopha, { name: 'Quiz', language: 'paper' as never })).rejects.toThrow('Choose Python, Java or Web.');
    // Another student may use the same name.
    await createProject(chenda, { name: 'Guessing game', language: 'java' });
  });

  it(`keeps at most ${PLAYGROUND_LIMIT} projects per student`, async () => {
    const have = (await myProjects(chenda)).length;
    for (let i = have; i < PLAYGROUND_LIMIT; i++) await createProject(chenda, { name: `Project ${i}`, language: 'python' });
    await expect(createProject(chenda, { name: 'One too many', language: 'python' })).rejects.toThrow(
      `You can keep up to ${PLAYGROUND_LIMIT} projects. Delete one you don’t need first.`,
    );
    expect(await myProjects(chenda)).toHaveLength(PLAYGROUND_LIMIT);
  });

  it('is for students only', async () => {
    await expect(createProject(sophea, { name: 'Demo', language: 'web' })).rejects.toThrow(ForbiddenError);
    await expect(myProjects(admin)).rejects.toThrow(ForbiddenError);
    await expect(myProjects(null)).rejects.toThrow(ForbiddenError);
  });
});

describe('working on it', () => {
  it('saves the files as they are, and moves it to the top of the list', async () => {
    const [, older] = await myProjects(bopha);
    const files = [
      { path: 'index.html', content: '<h1>Hi</h1><script src="js/app.js"></script>' },
      { path: 'js/app.js', content: 'console.log(1);' },
    ];
    const { savedAt } = await saveProject(bopha, older!.id, files);
    expect(await openProject(bopha, older!.id)).toMatchObject({ files, savedAt });
    expect((await myProjects(bopha))[0]!.id).toBe(older!.id);
  });

  it('refuses files that break the project rules, and keeps the last good save', async () => {
    const [p] = await myProjects(bopha);
    const before = (await openProject(bopha, p!.id)).files;
    await expect(saveProject(bopha, p!.id, [{ path: '../evil.py', content: '' }])).rejects.toThrow(/outside the project folder/);
    await expect(saveProject(bopha, p!.id, [{ path: 'big.py', content: 'x'.repeat(LIMITS.maxBytes + 1) }])).rejects.toThrow(
      /at most 200 KB/,
    );
    await expect(saveProject(bopha, p!.id, [{ path: 'app.exe', content: '' }])).rejects.toThrow();
    expect((await openProject(bopha, p!.id)).files).toEqual(before);
  });

  it('renames it, keeping names unique', async () => {
    const [a, b] = await myProjects(bopha);
    await renameProject(bopha, a!.id, 'Landing page');
    expect((await openProject(bopha, a!.id)).name).toBe('Landing page');
    await expect(renameProject(bopha, a!.id, b!.name.toLowerCase())).rejects.toThrow(
      `You already have a project called ${b!.name.toLowerCase()}.`,
    );
    await renameProject(bopha, a!.id, 'LANDING PAGE'); // the same project, with different capitals
    expect((await openProject(bopha, a!.id)).name).toBe('LANDING PAGE');
  });

  it('is found by its owner only: for anyone else it doesn’t exist', async () => {
    const [p] = await myProjects(bopha);
    const gone = 'That project no longer exists.';
    await expect(openProject(chenda, p!.id)).rejects.toThrow(gone);
    await expect(saveProject(chenda, p!.id, [{ path: 'main.py', content: 'hacked' }])).rejects.toThrow(gone);
    await expect(renameProject(chenda, p!.id, 'Mine now')).rejects.toThrow(gone);
    await expect(deleteProject(chenda, p!.id)).rejects.toThrow(gone);
    await expect(openProject(sophea, p!.id)).rejects.toThrow(ForbiddenError);
    expect((await openProject(bopha, p!.id)).name).not.toBe('Mine now');
  });

  it('deletes it', async () => {
    const [p, ...rest] = await myProjects(bopha);
    await deleteProject(bopha, p!.id);
    expect((await myProjects(bopha)).map((x) => x.id)).toEqual(rest.map((x) => x.id));
    await expect(openProject(bopha, p!.id)).rejects.toThrow('That project no longer exists.');
  });
});

describe('the student’s account', () => {
  it('takes their projects with it when it is deleted, and keeps them while it is switched off', async () => {
    await setActive(admin, chenda.userId, false);
    expect(await one('select count(*)::int as n from playground_project where owner_id = $1', [chenda.userId])).toEqual({
      n: PLAYGROUND_LIMIT,
    });
    await pool.query('delete from "user" where id = $1', [chenda.userId]);
    expect(await one('select count(*)::int as n from playground_project where owner_id = $1', [chenda.userId])).toEqual({ n: 0 });
  });

  it('writes no audit rows: like a draft, it is the student’s own scratch work', async () => {
    expect(await one(`select count(*)::int as n from audit_log where entity = 'playground_project'`)).toEqual({ n: 0 });
  });
});
