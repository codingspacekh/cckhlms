// Term and course rules (FR-ADM-03/04), shared by services and forms.
import { z } from 'zod';

export const LANGUAGES = ['python', 'java', 'web'] as const;
export type Language = (typeof LANGUAGES)[number];
export const LANGUAGE_LABEL: Record<Language, string> = { python: 'Python', java: 'Java', web: 'HTML/CSS/JS' };

export const termName = (year: number, number: number) => `Term ${number} · ${year}`;

const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Use a date like 2027-01-09.')
  .refine((d) => !Number.isNaN(Date.parse(`${d}T00:00:00Z`)), 'That date does not exist.');

export const termInputSchema = z
  .object({
    year: z.coerce.number().int().min(2024, 'Choose a year from 2024.').max(2100),
    number: z.coerce.number().int().min(1, 'Terms are numbered 1 to 4.').max(4, 'Terms are numbered 1 to 4.'),
    startDate: isoDate,
    endDate: isoDate,
  })
  .refine((t) => t.endDate > t.startDate, { message: 'The term must end after it starts.', path: ['endDate'] });
export type TermInput = Partial<Record<keyof z.input<typeof termInputSchema>, unknown>>;

const percent = (fallback: number) => z.coerce.number().int().min(0, 'Use 0 to 100.').max(100, 'Use 0 to 100.').default(fallback);

export const courseInputSchema = z
  .object({
    code: z
      .string()
      .trim()
      .transform((c) => c.toUpperCase())
      .pipe(z.string().regex(/^[A-Z0-9-]{2,12}$/, 'Use a short code of 2–12 letters, digits or dashes, like PY1.')),
    name: z.string().trim().min(1, 'Enter the course name.').max(100, 'That name is too long.'),
    description: z.preprocess(
      (v) => (v === '' || v === null ? undefined : v),
      z.string().trim().max(2000, 'The description is too long.').optional(),
    ),
    defaultLanguage: z.enum(LANGUAGES, { message: 'Choose Python, Java or HTML/CSS/JS.' }),
    passMark: percent(60),
    weightExam: percent(60),
    weightClasswork: percent(30),
    weightHomework: percent(10),
    nextCourseId: z.preprocess((v) => (v === '' ? null : v), z.string().nullable().optional()),
  })
  .refine((c) => c.weightExam + c.weightClasswork + c.weightHomework === 100, {
    message: 'Exam, classwork and homework weights must add up to 100.',
    path: ['weightExam'],
  });
// Forms and callers may pass loosely typed values; the schema validates everything.
export type CourseInput = Partial<Record<keyof z.input<typeof courseInputSchema>, unknown>>;

export const MAX_TOPICS = 60;
export const MAX_TOPIC_LENGTH = 120;

export function parseSyllabus(text: string): string[] {
  const topics = text
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);
  if (topics.length > MAX_TOPICS) throw new RangeError(`A syllabus can have at most ${MAX_TOPICS} topics.`);
  const long = topics.find((t) => t.length > MAX_TOPIC_LENGTH);
  if (long) throw new RangeError(`Each topic can be at most ${MAX_TOPIC_LENGTH} characters ("${long.slice(0, 30)}…").`);
  return topics;
}

// Following "next level" links from `next` must never come back to `courseId`.
export function wouldCreateCycle(courseId: string, next: string | null | undefined, links: Map<string, string | null>): boolean {
  const seen = new Set<string>();
  let cur = next ?? null;
  while (cur) {
    if (cur === courseId) return true;
    if (seen.has(cur)) return false;
    seen.add(cur);
    cur = links.get(cur) ?? null;
  }
  return false;
}
