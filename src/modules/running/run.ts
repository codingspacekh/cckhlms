// Running a student's program (M11, FR-CODE-09/10, BR-25, ADR-0004). The checks happen here, before anything reaches
// the runner: who is running it, the language, the same file limits as saving, the input's size and how often.
// Nothing about a run is saved.
import { z } from 'zod';
import { checkProject, isImagePath, ProjectError } from '@/lib/project/files';
import type { Actor } from '@/server/actor';
import { assertCan, ValidationError } from '@/server/errors';
import { runnerFromEnv, type CodeRunner, type RunResult } from '@/server/runner';

export const MAX_INPUT = 10 * 1024;
export const RUNS_PER_MINUTE = 20;

const runSchema = z.object({
  language: z.enum(['python', 'java'], { message: 'Only Python or Java programs can be run.' }),
  files: z.array(z.object({ path: z.string(), content: z.string() })),
  stdin: z.string().max(MAX_INPUT, 'The input is too long: keep it under 10 KB.').default(''),
});
// Callers pass what the browser sent; the schema checks all of it.
export type RunInput = Partial<Record<keyof z.input<typeof runSchema>, unknown>>;

// Who ran when, in the last minute. Kept in each server process (two in production), which is enough to stop a
// program being run in a loop; it isn't a quota.
const recent = new Map<string, number[]>();

function countRun(userId: string, now: number) {
  const last = (recent.get(userId) ?? []).filter((at) => now - at < 60_000);
  if (last.length >= RUNS_PER_MINUTE)
    throw new ValidationError(`That's ${RUNS_PER_MINUTE} runs a minute, the most allowed. Wait a moment and run it again.`);
  recent.set(userId, [...last, now]);
}

export async function runCode(
  actor: Actor | null,
  raw: RunInput,
  opts: { runner?: CodeRunner | null; now?: number } = {},
): Promise<RunResult> {
  assertCan(actor, 'code.run');
  const parsed = runSchema.safeParse(raw);
  if (!parsed.success) throw ValidationError.fromZod(parsed.error);
  const { language, files, stdin } = parsed.data;
  try {
    checkProject(files);
  } catch (err) {
    if (err instanceof ProjectError) throw new ValidationError(err.message);
    throw err;
  }
  // Pictures stay behind: a program can't use them, and they are most of a project's size.
  const code = files.filter((f) => !isImagePath(f.path));
  if (code.length === 0) throw new ValidationError('There is nothing to run: add a .py or .java file.');
  countRun(actor.userId, opts.now ?? Date.now());
  const runner = opts.runner === undefined ? runnerFromEnv() : opts.runner;
  if (!runner) return { status: 'unavailable', stdout: '', stderr: '', exitCode: null, ms: 0, truncated: false, mainClass: null };
  return runner.run({ language, files: code, stdin, owner: actor.userId });
}
