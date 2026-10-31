// M11 · FR-CODE-09/10, BR-25: the checks before a run, and the runner client, against a stand-in runner that records
// what it is sent (the real runner is tested by infra/tests/runner-image.sh).
import { createHash } from 'node:crypto';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { runCode } from '@/modules/running/run';
import type { Actor } from '@/server/actor';
import { ForbiddenError, ValidationError } from '@/server/errors';
import { httpRunner } from '@/server/runner';

const student: Actor = { userId: 's1', username: 'bopha.l', name: 'Bopha', role: 'student', sessionId: 's' };
const teacher: Actor = { userId: 't1', username: 'sophea', name: 'Sophea', role: 'teacher', sessionId: 's' };
const admin: Actor = { userId: 'a1', username: 'admin', name: 'Admin', role: 'admin', sessionId: 's' };
const ok = { status: 'ok', stdout: 'hi\n', stderr: '', exitCode: 0, ms: 120, truncated: false, mainClass: null };
let server: Server;
let url = '';
let reply: { status: number; body: unknown } = { status: 200, body: ok };
const seen: { auth?: string; owner?: string; body: { language: string; files: { path: string }[]; stdin: string } }[] = [];
let t = 1_000_000;
const runner = () => httpRunner(url, 'test-token');
const py = (over: Partial<{ language: string; files: { path: string; content: string }[]; stdin: string }> = {}) => ({
  language: 'python',
  files: [{ path: 'main.py', content: 'print("hi")' }],
  stdin: '',
  ...over,
});
// Each test is a new minute, so the per-person limit only matters where a test is about it.
const go = (actor: Actor | null, input: ReturnType<typeof py>, now = t) => runCode(actor, input, { runner: runner(), now });

beforeAll(async () => {
  server = createServer((req, res) => {
    let data = '';
    req.on('data', (c) => (data += c));
    req.on('end', () => {
      seen.push({
        auth: req.headers.authorization,
        owner: req.headers['x-run-owner'] as string | undefined,
        body: JSON.parse(data || '{}'),
      });
      res.writeHead(reply.status, { 'content-type': 'application/json' });
      res.end(JSON.stringify(reply.body));
    });
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterAll(() => new Promise<void>((r) => server.close(() => r())));
beforeEach(() => {
  seen.length = 0;
  reply = { status: 200, body: ok };
  t += 120_000;
});

describe('runCode', () => {
  it('sends the code files and the input to the runner, with its token, and returns what it says', async () => {
    const result = await go(
      student,
      py({
        files: [
          { path: 'main.py', content: 'print(input())' },
          { path: 'helpers.py', content: 'x = 1' },
          { path: 'cat.png', content: 'data:image/png;base64,iVBORw0KGgo=' },
        ],
        stdin: 'Dara\n',
      }),
    );
    expect(result).toEqual(ok);
    expect(seen).toHaveLength(1);
    expect(seen[0]!.auth).toBe('Bearer test-token');
    expect(seen[0]!.body.files.map((f) => f.path)).toEqual(['main.py', 'helpers.py']); // no pictures
    expect(seen[0]!.body.stdin).toBe('Dara\n');
  });

  it('lets teachers run code too (their starter files, a student’s work), but not someone signed out or Admin', async () => {
    expect((await go(teacher, py())).status).toBe('ok');
    await expect(go(null, py())).rejects.toThrow(ForbiddenError);
    await expect(go(admin, py())).rejects.toThrow(ForbiddenError);
  });

  it('runs only Python and Java, within the save limits and 10 KB of input', async () => {
    await expect(go(student, py({ language: 'web' }))).rejects.toThrow(/Python or Java/);
    const many = Array.from({ length: 31 }, (_, i) => ({ path: `f${i}.py`, content: '' }));
    await expect(go(student, py({ files: many }))).rejects.toThrow(ValidationError);
    await expect(go(student, py({ files: [{ path: 'main.py', content: 'a'.repeat(210 * 1024) }] }))).rejects.toThrow(ValidationError);
    await expect(go(student, py({ stdin: 'a'.repeat(10 * 1024 + 1) }))).rejects.toThrow(/input/);
    await expect(go(student, py({ files: [{ path: 'cat.png', content: 'data:image/png;base64,iVBORw0KGgo=' }] }))).rejects.toThrow(
      /nothing to run/,
    );
    expect(seen).toHaveLength(0);
  });

  it('allows 20 runs a minute per person', async () => {
    for (let i = 0; i < 20; i++) await go(student, py(), t + i * 100);
    await expect(go(student, py(), t + 2100)).rejects.toThrow(/20 runs a minute/);
    expect((await go(teacher, py(), t + 2200)).status).toBe('ok'); // someone else
    expect((await go(student, py(), t + 61_000)).status).toBe('ok'); // a minute later
  });

  it('names the person to the runner by a hash of their id, never the id itself (M17a, F10)', async () => {
    await go(student, py());
    expect(seen[0]!.owner).toBe(createHash('sha256').update('s1').digest('hex'));
    expect(JSON.stringify(seen[0]!.body)).not.toContain('s1');
  });

  it('says when the person already has a program running (M17a, F10)', async () => {
    reply = { status: 429, body: { error: 'already running' } };
    expect((await go(student, py())).status).toBe('already_running');
  });

  it('says the runner is busy, or not there, instead of failing', async () => {
    reply = { status: 503, body: { error: 'busy' } };
    expect((await go(student, py())).status).toBe('busy');
    const down = await runCode(student, py(), { runner: httpRunner('http://127.0.0.1:9', ''), now: t + 1 });
    expect(down.status).toBe('unavailable');
    expect((await runCode(student, py(), { runner: null, now: t + 2 })).status).toBe('unavailable');
  });
});
