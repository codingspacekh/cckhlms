// Weekly lesson notes (FR-TCH-01/02, FR-STU-02). One lesson per session; students see it once it's published
// and its publish time (if any) has passed, worked out when read (ADR-08).
import { and, asc, eq, inArray } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '@/db/client';
import { classSession, course, klass, lesson, lessonTopic, syllabusTopic } from '@/db/schema';
import { classAccess } from '@/modules/academics/access';
import { todayIn } from '@/modules/academics/schedule';
import { getClubSettings } from '@/modules/club/service';
import { renderMarkdown } from '@/lib/markdown';
import type { Actor } from '@/server/actor';
import { audit } from '@/server/audit';
import { assertCan, ValidationError } from '@/server/errors';
import { attachmentsOf, type AttachmentRow } from './attachments';
import { reviewCounts } from './qa';
import { reportedSessions } from './reports';
import { lessonState, publishAtFor, type LessonState, type LessonStatus } from './rules';
import { weeksOf } from './weeks';

export const MAX_LESSON_CHARS = 40_000;
type Opts = { now?: Date };

async function classInfo(classId: string) {
  const [c] = await db
    .select({ id: klass.id, name: klass.name, courseId: klass.courseId, courseName: course.name })
    .from(klass)
    .innerJoin(course, eq(course.id, klass.courseId))
    .where(eq(klass.id, classId))
    .limit(1);
  if (!c) throw new ValidationError('That class no longer exists.');
  return c;
}

async function topicsOf(lessonIds: string[]) {
  if (!lessonIds.length) return [];
  return db
    .select({ lessonId: lessonTopic.lessonId, id: syllabusTopic.id, title: syllabusTopic.title })
    .from(lessonTopic)
    .innerJoin(syllabusTopic, eq(syllabusTopic.id, lessonTopic.topicId))
    .where(inArray(lessonTopic.lessonId, lessonIds))
    .orderBy(asc(syllabusTopic.position));
}

const asLesson = (l: typeof lesson.$inferSelect) => ({ ...l, status: l.status as LessonStatus });

export type WeekRow = {
  sessionId: string;
  week: number | null;
  date: string;
  startTime: string;
  minutes: number;
  cancelled: boolean;
  lesson: { title: string; state: LessonState } | null;
  toReview: number; // reported Q&A posts waiting for a teacher
  report: 'done' | 'missing' | 'upcoming'; // the weekly report (FR-TCH-14)
};

// The teacher's list of weeks with each lesson's state.
export async function classWeeks(actor: Actor | null, classId: string, opts: Opts = {}): Promise<WeekRow[]> {
  assertCan(actor, 'lesson.write', await classAccess(classId, 'read'));
  const sessions = await weeksOf(classId);
  const lessons = sessions.length
    ? await db
        .select()
        .from(lesson)
        .where(
          inArray(
            lesson.sessionId,
            sessions.map((s) => s.id),
          ),
        )
    : [];
  const now = opts.now ?? new Date();
  const review = await reviewCounts(lessons.map((l) => l.id));
  const reported = await reportedSessions(sessions.map((s) => s.id));
  const today = todayIn((await getClubSettings()).timeZone, now);
  return sessions.map((s) => {
    const l = lessons.find((x) => x.sessionId === s.id);
    return {
      sessionId: s.id,
      week: s.week,
      date: s.date,
      startTime: s.startTime,
      minutes: s.minutes,
      cancelled: s.cancelled,
      lesson: l ? { title: l.title, state: lessonState(asLesson(l), now) } : null,
      toReview: l ? (review.get(l.id) ?? 0) : 0,
      report: reported.has(s.id) ? 'done' : s.date <= today ? 'missing' : 'upcoming',
    };
  });
}

export type LessonEditor = {
  classId: string;
  className: string;
  courseName: string;
  session: { id: string; date: string; startTime: string; minutes: number; week: number };
  weeks: number[];
  lesson: {
    title: string;
    contentMd: string;
    status: LessonStatus;
    publishAt: Date | null;
    state: LessonState;
    topicIds: string[];
  } | null;
  syllabus: { id: string; title: string }[];
  attachments: AttachmentRow[];
  timeZone: string;
};

export async function lessonForEdit(actor: Actor | null, classId: string, week: number, opts: Opts = {}): Promise<LessonEditor> {
  assertCan(actor, 'lesson.write', await classAccess(classId, 'read'));
  const c = await classInfo(classId);
  const all = await weeksOf(classId);
  const s = all.find((r) => r.week === week);
  if (!s) throw new ValidationError(`This class has no week ${week}.`);
  const [l] = await db.select().from(lesson).where(eq(lesson.sessionId, s.id)).limit(1);
  const syllabus = await db
    .select({ id: syllabusTopic.id, title: syllabusTopic.title })
    .from(syllabusTopic)
    .where(eq(syllabusTopic.courseId, c.courseId))
    .orderBy(asc(syllabusTopic.position));
  const topicIds = l ? (await topicsOf([l.id])).map((t) => t.id) : [];
  const attachments = l ? (await attachmentsOf([l.id])).map(({ lessonId: _, ...a }) => a) : [];
  return {
    classId,
    className: c.name,
    courseName: c.courseName,
    session: { id: s.id, date: s.date, startTime: s.startTime, minutes: s.minutes, week },
    weeks: all.flatMap((r) => (r.week ? [r.week] : [])),
    lesson: l
      ? {
          title: l.title,
          contentMd: l.contentMd,
          status: l.status as LessonStatus,
          publishAt: l.publishAt,
          state: lessonState(asLesson(l), opts.now ?? new Date()),
          topicIds,
        }
      : null,
    syllabus,
    attachments,
    timeZone: (await getClubSettings()).timeZone,
  };
}

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Choose the day to publish it.');
const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Choose the time to publish it.');
export const lessonInputSchema = z.object({
  title: z.string().trim().min(1, 'Give the lesson a title.').max(120, 'Keep the title under 120 characters.'),
  contentMd: z.string().max(MAX_LESSON_CHARS, `Keep the note under ${MAX_LESSON_CHARS.toLocaleString('en')} characters.`),
  topicIds: z.array(z.string()).max(100),
  intent: z.enum(['draft', 'publish', 'schedule']),
  publishDate: z.string().optional(),
  publishTime: z.string().optional(),
});
export type LessonInput = z.input<typeof lessonInputSchema>;

export async function saveLesson(
  actor: Actor | null,
  sessionId: string,
  raw: LessonInput,
  opts: Opts = {},
): Promise<{ state: LessonState }> {
  const [s] = await db.select().from(classSession).where(eq(classSession.id, sessionId)).limit(1);
  if (!s) throw new ValidationError('That session no longer exists.');
  assertCan(actor, 'lesson.write', await classAccess(s.classId));
  if (s.status === 'cancelled') throw new ValidationError('That session is cancelled, so it has no lesson.');
  const parsed = lessonInputSchema.safeParse(raw);
  if (!parsed.success) throw ValidationError.fromZod(parsed.error);
  const input = parsed.data;
  const now = opts.now ?? new Date();

  const c = await classInfo(s.classId);
  const topicIds = [...new Set(input.topicIds)];
  if (topicIds.length) {
    const known = await db
      .select({ id: syllabusTopic.id })
      .from(syllabusTopic)
      .where(and(eq(syllabusTopic.courseId, c.courseId), inArray(syllabusTopic.id, topicIds)));
    if (known.length !== topicIds.length) throw new ValidationError(`Choose topics from the ${c.courseName} syllabus.`, 'topicIds');
  }

  let publishAt: Date | null = null;
  if (input.intent === 'schedule') {
    const date = isoDate.safeParse(input.publishDate ?? '');
    if (!date.success) throw new ValidationError(date.error.issues[0]!.message, 'publishDate');
    const t = time.safeParse(input.publishTime ?? '');
    if (!t.success) throw new ValidationError(t.error.issues[0]!.message, 'publishTime');
    publishAt = publishAtFor(date.data, t.data, (await getClubSettings()).timeZone);
    if (publishAt.getTime() <= now.getTime()) throw new ValidationError('Pick a time in the future, or publish it now.', 'publishDate');
  }
  const status: LessonStatus = input.intent === 'draft' ? 'draft' : 'published';

  const state = lessonState({ status, publishAt }, now);
  await db.transaction(async (tx) => {
    const [row] = await tx
      .insert(lesson)
      .values({
        id: crypto.randomUUID(),
        sessionId,
        title: input.title,
        contentMd: input.contentMd,
        status,
        publishAt,
        authorId: actor.userId,
      })
      .onConflictDoUpdate({
        target: lesson.sessionId,
        set: { title: input.title, contentMd: input.contentMd, status, publishAt, authorId: actor.userId, updatedAt: now },
      })
      .returning({ id: lesson.id });
    await tx.delete(lessonTopic).where(eq(lessonTopic.lessonId, row!.id));
    if (topicIds.length) await tx.insert(lessonTopic).values(topicIds.map((topicId) => ({ lessonId: row!.id, topicId })));
    await audit(
      {
        actorId: actor.userId,
        action: 'lesson.save',
        entity: 'lesson',
        entityId: row!.id,
        detail: { classId: s.classId, date: s.date, state, publishAt: publishAt?.toISOString() ?? null },
      },
      tx,
    );
  });
  return { state };
}

// Published lessons of a class, by week (FR-STU-02).
async function visibleLessons(classId: string, now: Date) {
  const sessions = (await weeksOf(classId)).filter((s) => s.week !== null);
  if (!sessions.length) return [];
  const rows = await db
    .select()
    .from(lesson)
    .where(
      and(
        inArray(
          lesson.sessionId,
          sessions.map((s) => s.id),
        ),
        eq(lesson.status, 'published'),
      ),
    );
  const visible = rows.filter((l) => lessonState(asLesson(l), now) === 'published');
  const topics = await topicsOf(visible.map((l) => l.id));
  return sessions.flatMap((s) => {
    const l = visible.find((x) => x.sessionId === s.id);
    return l ? [{ lesson: l, week: s.week!, date: s.date, topics: topics.filter((t) => t.lessonId === l.id).map((t) => t.title) }] : [];
  });
}

export type LessonListRow = { week: number; date: string; title: string; topics: string[] };

export async function classLessons(
  actor: Actor | null,
  classId: string,
  opts: Opts = {},
): Promise<{ className: string; lessons: LessonListRow[] }> {
  assertCan(actor, 'lesson.read', await classAccess(classId));
  const c = await classInfo(classId);
  const lessons = await visibleLessons(classId, opts.now ?? new Date());
  return { className: c.name, lessons: lessons.map((l) => ({ week: l.week, date: l.date, title: l.lesson.title, topics: l.topics })) };
}

export type LessonView = {
  className: string;
  week: number;
  date: string;
  title: string;
  html: string;
  topics: string[];
  attachments: AttachmentRow[];
  weeks: number[];
};

// One published lesson, or null if that week has none yet.
export async function readLesson(actor: Actor | null, classId: string, week: number, opts: Opts = {}): Promise<LessonView | null> {
  assertCan(actor, 'lesson.read', await classAccess(classId));
  const c = await classInfo(classId);
  const lessons = await visibleLessons(classId, opts.now ?? new Date());
  const l = lessons.find((x) => x.week === week);
  if (!l) return null;
  return {
    className: c.name,
    week,
    date: l.date,
    title: l.lesson.title,
    html: renderMarkdown(l.lesson.contentMd),
    topics: l.topics,
    attachments: (await attachmentsOf([l.lesson.id])).map(({ lessonId: _, ...a }) => a),
    weeks: lessons.map((x) => x.week),
  };
}
