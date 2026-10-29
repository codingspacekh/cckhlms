'use server';
// The Run button (M11). Next.js checks the Origin of every action; runCode checks who may run what.
import { toResult, type FormResult } from '@/server/action-result';
import { currentActor } from '@/server/guard';
import type { RunResult } from '@/server/runner';
import { runCode, type RunInput } from './run';

export async function runCodeAction(input: RunInput): Promise<FormResult<RunResult>> {
  return toResult(async () => ({ ok: true, data: await runCode(await currentActor(), input) }));
}
