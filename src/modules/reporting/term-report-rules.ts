// A student's term report (FR-TCH-15/16/17): rating, comment, needs support, and the result. The final score is
// the calculated overall score (BR-12) unless the teacher adjusts it; the result is suggested from it and the
// course's pass mark (BR-13). Departing from either needs a written reason, which goes to the audit log.
import { z } from 'zod';
import { ValidationError } from '@/server/errors';
import { suggestedResult, type Result } from './rules';

export const RATINGS = ['excellent', 'good', 'developing', 'needs_work'] as const;
export type Rating = (typeof RATINGS)[number];
export const RATING_LABEL: Record<Rating, string> = {
  excellent: 'Excellent',
  good: 'Good',
  developing: 'Developing',
  needs_work: 'Needs work',
};
export const RESULT_LABEL: Record<Result, string> = { pass: 'Pass', fail: 'Fail' };

const schema = z.object({
  rating: z.union([z.enum(RATINGS), z.literal('')], { error: 'Choose a rating.' }),
  comment: z.string().max(1000, 'Keep the comment under 1,000 characters.'),
  needsSupport: z.boolean(),
  supportNote: z.string().max(500, 'Keep the support note under 500 characters.'),
  finalScore: z.string().max(10),
  result: z.union([z.enum(['pass', 'fail']), z.literal('')], { error: 'Choose Pass or Fail.' }),
  reason: z.string().max(500, 'Keep the reason under 500 characters.'),
  // Only for a published report (BR-08): why it's being changed.
  changeReason: z.string().max(500, 'Keep the reason under 500 characters.').optional(),
});
export type TermReportInput = z.input<typeof schema>;
export type TermReportFields = {
  rating: Rating | null;
  comment: string;
  needsSupport: boolean;
  supportNote: string;
  finalScore: number | null; // null = the calculated score
  result: Result | null;
  reason: string | null;
};

function parseFinal(raw: string): number | null {
  const text = raw.trim();
  if (!text) return null;
  const n = /^\d+(\.\d)?$/.test(text) ? Number(text) : NaN;
  if (!(n >= 0 && n <= 100)) throw new ValidationError('Enter a final score from 0 to 100, with at most 1 decimal.', 'finalScore');
  return n;
}

export function checkTermReport(raw: TermReportInput, ctx: { calculated: number | null; passMark: number }): TermReportFields {
  const parsed = schema.safeParse(raw);
  if (!parsed.success) throw ValidationError.fromZod(parsed.error);
  const input = parsed.data;
  const supportNote = input.needsSupport ? input.supportNote.trim() : '';
  if (input.needsSupport && !supportNote) throw new ValidationError('Say what support they need.', 'supportNote');

  let finalScore = parseFinal(input.finalScore);
  if (finalScore === ctx.calculated) finalScore = null;
  const score = finalScore ?? ctx.calculated;
  const result = input.result || null;
  const suggested = suggestedResult(score, ctx.passMark);
  const reason = input.reason.trim();
  if (finalScore !== null && !reason)
    throw new ValidationError(
      ctx.calculated === null
        ? 'Write why you are giving a final score.'
        : `Write why the final score differs from the calculated ${ctx.calculated.toFixed(1)}.`,
      'reason',
    );
  if (result && result !== suggested && !reason)
    throw new ValidationError(
      suggested
        ? `The score suggests ${RESULT_LABEL[suggested]}. Write why the result is ${RESULT_LABEL[result]}.`
        : `There is no score to suggest a result. Write why the result is ${RESULT_LABEL[result]}.`,
      'reason',
    );
  const departs = finalScore !== null || (result !== null && result !== suggested);
  return {
    rating: input.rating || null,
    comment: input.comment.trim(),
    needsSupport: input.needsSupport,
    supportNote,
    finalScore,
    result,
    reason: departs ? reason : null,
  };
}

// What's still missing before a report can be published: the teacher confirms the result (BR-13).
export function missingToPublish(r: Pick<TermReportFields, 'rating' | 'result' | 'finalScore'>, calculated: number | null): string[] {
  const missing: string[] = [];
  if (!r.rating) missing.push('a rating');
  if (!r.result) missing.push('a result');
  if (r.finalScore === null && calculated === null) missing.push('a score');
  return missing;
}
