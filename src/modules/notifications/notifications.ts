// In-app notifications (FR-SYS-01, FR-STU-09). Nothing is written when something happens: each area's feed is
// worked out from lessons, work, marks and Q&A when it's read (ADR-08), so scheduled lessons and "due soon" turn
// up on time. The only thing stored is how far each person has read each area.
import { and, desc, eq, gte, inArray, isNotNull, isNull, ne, sql } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import { db } from '@/db/client';
import {
  assessment,
  classTeacher,
  enrolment,
  excusal,
  klass,
  lesson,
  notificationSeen,
  postReport,
  question,
  reply,
  submission,
  user,
} from '@/db/schema';
import { KIND_LABEL, formatDue, resolveDue, type Kind, type WorkLanguage } from '@/modules/assessments/rules';
import { getClubSettings } from '@/modules/club/service';
import { supportLineNotifications } from '@/modules/support/support-lines';
import { weeksOf } from '@/modules/teaching/weeks';
import type { Actor } from '@/server/actor';
import { assertCan } from '@/server/errors';
import { dueSoonAt, isDueSoon, lessonShownAt, snippet, sortFeed, windowStart, type Area, type Notification } from './rules';

type Opts = { now?: Date };
type ClassWeeks = { id: string; name: string; sessions: Awaited<ReturnType<typeof weeksOf>> };

function assertArea(actor: Actor | null, area: Area): asserts actor is Actor {
  assertCan(actor, area === 'student' ? 'student.area' : 'teacher.area');
}

async function withWeeks(classes: { id: string; name: string }[]): Promise<ClassWeeks[]> {
  return Promise.all(classes.map(async (c) => ({ ...c, sessions: await weeksOf(c.id) })));
}
// Where each session is: its class and week number (cancelled sessions have no week, and nothing in them shows).
function sessionIndex(classes: ClassWeeks[]) {
  const index = new Map<string, { classId: string; className: string; week: number }>();
  for (const c of classes)
    for (const s of c.sessions) if (s.week !== null) index.set(s.id, { classId: c.id, className: c.name, week: s.week });
  return index;
}

async function studentFeed(userId: string, now: Date): Promise<Notification[]> {
  const classes = await withWeeks(
    await db
      .select({ id: klass.id, name: klass.name })
      .from(enrolment)
      .innerJoin(klass, eq(klass.id, enrolment.classId))
      .where(and(eq(enrolment.studentId, userId), eq(enrolment.status, 'active'), eq(klass.status, 'active'))),
  );
  const at = sessionIndex(classes);
  if (!at.size) return [];
  const sessionIds = [...at.keys()];
  const since = windowStart(now);
  const tz = (await getClubSettings()).timeZone;
  const items: Notification[] = [];

  const lessons = await db
    .select({
      id: lesson.id,
      title: lesson.title,
      sessionId: lesson.sessionId,
      publishAt: lesson.publishAt,
      publishedAt: lesson.publishedAt,
    })
    .from(lesson)
    .where(and(inArray(lesson.sessionId, sessionIds), eq(lesson.status, 'published'), isNotNull(lesson.publishedAt)));
  for (const l of lessons) {
    const shown = lessonShownAt(l);
    const s = at.get(l.sessionId)!;
    if (shown && shown <= now)
      items.push({
        id: `lesson:${l.id}`,
        kind: 'lesson',
        at: shown,
        title: `New lesson: Week ${s.week} · ${l.title}`,
        detail: '',
        href: `/student/classes/${s.classId}/weeks/${s.week}`,
        className: s.className,
      });
  }

  const works = await db
    .select()
    .from(assessment)
    .where(and(inArray(assessment.sessionId, sessionIds), eq(assessment.status, 'published'), isNotNull(assessment.publishedAt)));
  if (works.length) {
    const workIds = works.map((w) => w.id);
    // Only the latest version counts (BR-04).
    const latest = await db
      .selectDistinctOn([submission.assessmentId], {
        assessmentId: submission.assessmentId,
        score: submission.score,
        gradedAt: submission.gradedAt,
        returnedAt: submission.returnedAt,
      })
      .from(submission)
      .where(and(eq(submission.studentId, userId), inArray(submission.assessmentId, workIds)))
      .orderBy(submission.assessmentId, desc(submission.version));
    const excused = new Set(
      (
        await db
          .select({ id: excusal.assessmentId })
          .from(excusal)
          .where(and(eq(excusal.studentId, userId), inArray(excusal.assessmentId, workIds)))
      ).map((r) => r.id),
    );
    const latestOf = new Map(latest.map((r) => [r.assessmentId, r]));
    for (const w of works) {
      const s = at.get(w.sessionId)!;
      const sessions = classes.find((c) => c.id === s.classId)!.sessions;
      const due = resolveDue({ sessionId: w.sessionId, dueMode: w.dueMode as never, dueAt: w.dueAt }, sessions, tz);
      const href = `/student/classes/${s.classId}/work/${w.id}`;
      const base = { href, className: s.className };
      const mine = latestOf.get(w.id);
      items.push({
        ...base,
        id: `work:${w.id}`,
        kind: 'work',
        at: w.publishedAt!,
        title: `New ${KIND_LABEL[w.kind as Kind].toLowerCase()}: ${w.title}`,
        detail: due ? `Due ${formatDue(due, tz)}` : 'No due date',
      });
      const open = { due, language: w.language as WorkLanguage, handedIn: !!mine && !mine.returnedAt, excused: excused.has(w.id) };
      if (isDueSoon(open, now)) {
        const from = dueSoonAt(open)!;
        items.push({
          ...base,
          id: `due:${w.id}`,
          kind: 'due_soon',
          at: from > w.publishedAt! ? from : w.publishedAt!,
          title: `Due soon: ${w.title}`,
          detail: `Due ${formatDue(due, tz)}`,
        });
      }
      if (mine?.returnedAt)
        items.push({
          ...base,
          id: `returned:${w.id}:${mine.returnedAt.getTime()}`,
          kind: 'returned',
          at: mine.returnedAt,
          title: `Sent back for a redo: ${w.title}`,
          detail: 'Read your teacher’s feedback, then hand it in again.',
        });
      else if (mine?.gradedAt && mine.score != null)
        items.push({
          ...base,
          id: `marked:${w.id}:${mine.gradedAt.getTime()}`,
          kind: 'marked',
          at: mine.gradedAt,
          title: `Marked: ${w.title}`,
          detail: `Score ${mine.score} / ${w.maxScore}`,
        });
    }
  }

  const author = alias(user, 'reply_author');
  const replies = await db
    .select({ id: reply.id, at: reply.createdAt, name: author.name, body: question.bodyMd, sessionId: lesson.sessionId })
    .from(reply)
    .innerJoin(question, eq(question.id, reply.questionId))
    .innerJoin(lesson, eq(lesson.id, question.lessonId))
    .innerJoin(author, eq(author.id, reply.authorId))
    .where(
      and(
        eq(question.authorId, userId),
        ne(reply.authorId, userId),
        eq(reply.visibility, 'visible'),
        ne(question.visibility, 'hidden'),
        gte(reply.createdAt, since),
        inArray(lesson.sessionId, sessionIds),
      ),
    );
  for (const r of replies) {
    const s = at.get(r.sessionId)!;
    items.push({
      id: `reply:${r.id}`,
      kind: 'reply',
      at: r.at,
      title: `${r.name} replied to your question`,
      detail: snippet(r.body),
      href: `/student/classes/${s.classId}/weeks/${s.week}`,
      className: s.className,
    });
  }
  return items;
}

async function teacherFeed(userId: string, now: Date): Promise<Notification[]> {
  const classes = await withWeeks(
    await db
      .select({ id: klass.id, name: klass.name })
      .from(classTeacher)
      .innerJoin(klass, eq(klass.id, classTeacher.classId))
      .where(and(eq(classTeacher.userId, userId), eq(klass.status, 'active'))),
  );
  const at = sessionIndex(classes);
  if (!at.size) return [];
  const sessionIds = [...at.keys()];
  const since = windowStart(now);
  const questionsPage = (sessionId: string) => {
    const s = at.get(sessionId)!;
    return { href: `/teacher/classes/${s.classId}/weeks/${s.week}/questions`, className: s.className };
  };
  const items: Notification[] = [];

  const asker = alias(user, 'asker');
  const questions = await db
    .select({ id: question.id, at: question.createdAt, name: asker.name, body: question.bodyMd, sessionId: lesson.sessionId })
    .from(question)
    .innerJoin(lesson, eq(lesson.id, question.lessonId))
    .innerJoin(asker, eq(asker.id, question.authorId))
    .where(
      and(
        inArray(lesson.sessionId, sessionIds),
        ne(question.authorId, userId),
        ne(question.visibility, 'hidden'),
        gte(question.createdAt, since),
      ),
    );
  for (const q of questions)
    items.push({
      id: `question:${q.id}`,
      kind: 'question',
      at: q.at,
      title: `${q.name} asked a question`,
      detail: snippet(q.body),
      ...questionsPage(q.sessionId),
    });

  // Reports still waiting for a decision, on questions and on replies.
  const open = and(isNull(postReport.resolvedAt), gte(postReport.createdAt, since), inArray(lesson.sessionId, sessionIds));
  const reports = [
    ...(await db
      .select({ id: postReport.id, at: postReport.createdAt, type: postReport.postType, sessionId: lesson.sessionId })
      .from(postReport)
      .innerJoin(question, and(eq(postReport.postType, 'question'), eq(question.id, postReport.postId)))
      .innerJoin(lesson, eq(lesson.id, question.lessonId))
      .where(open)),
    ...(await db
      .select({ id: postReport.id, at: postReport.createdAt, type: postReport.postType, sessionId: lesson.sessionId })
      .from(postReport)
      .innerJoin(reply, and(eq(postReport.postType, 'reply'), eq(reply.id, postReport.postId)))
      .innerJoin(question, eq(question.id, reply.questionId))
      .innerJoin(lesson, eq(lesson.id, question.lessonId))
      .where(open)),
  ];
  for (const r of reports) {
    const s = at.get(r.sessionId)!;
    items.push({
      id: `report:${r.id}`,
      kind: 'report',
      at: r.at,
      title: `A ${r.type} was reported`,
      detail: `Week ${s.week}: decide whether it stays.`,
      ...questionsPage(r.sessionId),
    });
  }

  // Hand-ins waiting for a mark: the latest version of each student still in the class, one line per piece of work.
  const latest = db
    .selectDistinctOn([submission.assessmentId, submission.studentId], {
      assessmentId: submission.assessmentId,
      studentId: submission.studentId,
      score: submission.score,
      returnedAt: submission.returnedAt,
      byTeacher: submission.byTeacher,
      submittedAt: submission.submittedAt,
    })
    .from(submission)
    .innerJoin(assessment, eq(assessment.id, submission.assessmentId))
    .where(inArray(assessment.sessionId, sessionIds))
    .orderBy(submission.assessmentId, submission.studentId, desc(submission.version))
    .as('latest');
  const toMark = await db
    .select({
      id: assessment.id,
      title: assessment.title,
      sessionId: assessment.sessionId,
      n: sql<number>`count(*)::int`,
      at: sql<Date>`max(${latest.submittedAt})`.mapWith((v: string | Date) => new Date(v)),
    })
    .from(latest)
    .innerJoin(assessment, eq(assessment.id, latest.assessmentId))
    .innerJoin(
      enrolment,
      and(eq(enrolment.classId, assessment.classId), eq(enrolment.studentId, latest.studentId), eq(enrolment.status, 'active')),
    )
    .where(and(isNull(latest.score), isNull(latest.returnedAt), eq(latest.byTeacher, false)))
    .groupBy(assessment.id, assessment.title, assessment.sessionId);
  for (const w of toMark) {
    const s = at.get(w.sessionId);
    if (!s) continue;
    items.push({
      id: `to_mark:${w.id}:${w.n}`,
      kind: 'to_mark',
      at: w.at,
      title: `${w.n} ${w.n === 1 ? 'hand-in' : 'hand-ins'} to mark: ${w.title}`,
      detail: '',
      href: `/teacher/classes/${s.classId}/work/${w.id}`,
      className: s.className,
    });
  }
  return items;
}

async function seenAt(userId: string, area: Area): Promise<Date | null> {
  const [row] = await db
    .select({ seenAt: notificationSeen.seenAt })
    .from(notificationSeen)
    .where(and(eq(notificationSeen.userId, userId), eq(notificationSeen.area, area)))
    .limit(1);
  return row?.seenAt ?? null;
}

export async function notificationsFor(actor: Actor | null, area: Area, opts: Opts = {}) {
  assertArea(actor, area);
  const now = opts.now ?? new Date();
  const [feed, support, seen] = await Promise.all([
    area === 'student' ? studentFeed(actor.userId, now) : teacherFeed(actor.userId, now),
    supportLineNotifications(actor.userId, area, windowStart(now)),
    seenAt(actor.userId, area),
  ]);
  const items = sortFeed([...feed, ...support], now).map((n) => ({ ...n, unread: !seen || n.at > seen }));
  return { items, seenAt: seen };
}

export async function unreadCount(actor: Actor | null, area: Area, opts: Opts = {}): Promise<number> {
  return (await notificationsFor(actor, area, opts)).items.filter((n) => n.unread).length;
}

// Read up to `upTo` (the newest notification on the page, so anything newer stays unread), but never past the
// newest notification there is, and never further back.
export async function markSeen(actor: Actor | null, area: Area, upTo: Date, opts: Opts = {}) {
  const { items } = await notificationsFor(actor, area, opts);
  const newest = items[0]?.at ?? opts.now ?? new Date();
  const seen = upTo > newest ? newest : upTo;
  await db
    .insert(notificationSeen)
    .values({ userId: actor!.userId, area, seenAt: seen })
    .onConflictDoUpdate({
      target: [notificationSeen.userId, notificationSeen.area],
      set: { seenAt: sql`greatest(${notificationSeen.seenAt}, excluded.seen_at)` },
    });
}
