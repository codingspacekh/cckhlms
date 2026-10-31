// The CodeRunner interface (architecture §6.4, ADR-0004): runs a student's Python or Java program and says what it
// printed. Production talks to the runner container over a Unix socket the two share (RUNNER_URL=unix:/run/runner/
// runner.sock); development and CI over TCP with a token (RUNNER_URL=http://127.0.0.1:8090, RUNNER_TOKEN). With no
// RUNNER_URL there is no runner, and every run says so. Each run names its person by a SHA-256 of their id, and the
// runner allows one run at a time per person (M17a), so one person can't hold every slot.
import { createHash } from 'node:crypto';
import { request } from 'node:http';

export type RunLanguage = 'python' | 'java';
export type RunRequest = { language: RunLanguage; files: { path: string; content: string }[]; stdin: string; owner: string };
export type RunStatus =
  'ok' | 'error' | 'compile_error' | 'timeout' | 'output_limit' | 'needs_input' | 'busy' | 'already_running' | 'unavailable';
export type RunResult = {
  status: RunStatus;
  stdout: string;
  stderr: string;
  exitCode: number | null;
  ms: number;
  truncated: boolean;
  mainClass: string | null;
};
export interface CodeRunner {
  run(req: RunRequest): Promise<RunResult>;
}

// Waiting for a free slot (15 s), compiling Java (15 s) and running (10 s), with room to spare.
const TIMEOUT_MS = 50_000;
const empty = (status: RunStatus, stderr = ''): RunResult => ({
  status,
  stdout: '',
  stderr,
  exitCode: null,
  ms: 0,
  truncated: false,
  mainClass: null,
});

export function httpRunner(url: string, token: string): CodeRunner {
  const target = url.startsWith('unix:') ? { socketPath: url.slice(5) } : (({ hostname, port }) => ({ hostname, port }))(new URL(url));
  return {
    run: (req) =>
      new Promise((resolve) => {
        const { owner, ...program } = req;
        const body = JSON.stringify(program);
        const call = request(
          {
            ...target,
            path: '/run',
            method: 'POST',
            timeout: TIMEOUT_MS,
            headers: {
              'content-type': 'application/json',
              'content-length': Buffer.byteLength(body),
              'x-run-owner': createHash('sha256').update(owner).digest('hex'),
              ...(token ? { authorization: `Bearer ${token}` } : {}),
            },
          },
          (res) => {
            let data = '';
            res.setEncoding('utf8');
            res.on('data', (c: string) => (data += c));
            res.on('end', () => {
              if (res.statusCode === 503) return resolve(empty('busy'));
              if (res.statusCode === 429) return resolve(empty('already_running'));
              try {
                const r = JSON.parse(data) as Partial<RunResult> & { error?: string };
                if (res.statusCode !== 200) return resolve(empty('error', r.error ?? 'The runner refused this program.'));
                resolve({ ...empty(r.status ?? 'error'), ...r } as RunResult);
              } catch {
                resolve(empty('unavailable'));
              }
            });
          },
        );
        call.on('timeout', () => call.destroy(new Error('timeout')));
        call.on('error', () => resolve(empty('unavailable')));
        call.end(body);
      }),
  };
}

export function runnerFromEnv(env: NodeJS.ProcessEnv = process.env): CodeRunner | null {
  return env.RUNNER_URL ? httpRunner(env.RUNNER_URL, env.RUNNER_TOKEN ?? '') : null;
}
