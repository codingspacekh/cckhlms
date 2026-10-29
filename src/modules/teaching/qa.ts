// Questions and replies on a lesson (FR-STU-03/04/10, FR-TCH-03). Students see their own class only (BR-11).
// A reported post is hidden from other students and shown to its author as "under review" until a teacher
// restores or removes it (BR-20). A teacher's post can't be reported, so one student can't hide an answer.
// Since M12 a post is written in the compact editor and shown with renderPost: code blocks, no pictures (BR-26).
import { and, asc, eq, inArray, isNull } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '@/db/client';
import { classSession, course, klass, lesson, postReport, question, reply, user } from '@/db/schema';
import { classAccess } from '@/modules/academics/access';
import { renderPost } from '@/lib/markdown';
import type { Actor } from '@/server/actor';
import { audit } from '@/server/audit';
import { assertCan, ValidationError } from '@/server/errors';
import { can, type PolicyContext } from '@/server/policy';
import { lessonState, type LessonStatus } from './rules';
import { weeksOf } from './weeks';

type Opts = { now?: Date };
export type Visibility = 'visible' | 'under_review' | 'hidden';
export type PostRef = { type: 'question' | 'reply'; id: string };
type Report = { by: string; reason: string | null };

export type ReplyView = {
  id: string;
  author: string;
  byTeacher: boolean;
  mine: boolean;
  bodyHtml: string;
  createdAt: Date;
  state: Visibility;
  reports: Report[];
};
export type QuestionView = Omit<ReplyView, 'byTeacher'> & {
  byTeacher: boolean;
  code: string | null;
  acceptedReplyId: string | null;
  replies: ReplyView[];
};

// Room for a question with its code in it (M12); before, the code had its own box.
const MAX = 8000;
const bodySchema = (what: string) =>
  z
    .string()
    .trim()
    .min(1, `Write your ${what} first.`)
    .max(MAX, `Keep your ${what} under ${MAX.toLocaleString('en')} characters.`);

// The week's lesson, if students can see it: Q&A only happens on published lessons.
async function visibleLesson(classId: string, week: number, now: Date) {
  const s = (await weeksOf(classId)).find((r) => r.week === week);
  if (!s) throw new ValidationError(`This class has no week ${week}.`);
  const [l] = await db.select().from(lesson).where(eq(lesson.sessionId, s.id)).limit(1);
  return l && lessonState({ status: l.status as LessonStatus, publishAt: l.publishAt }, now) === 'published' ? l : null;
}

// Students see visible posts, plus their own while under review. The class's teachers see everything.
const shownTo = (state: Visibility, mine: boolean, moderator: boolean) =>
  moderator || state === 'visible' || (mine && state === 'under_review');

export async function lessonQuestions(
  actor: Actor | null,
  classId: string,
  week: number,
  opts: Opts = {},
): Promise<{ open: boolean; questions: QuestionView[]; toReview: number; codeLanguage: string }> {
  const ctx = await classAccess(classId, 'read');
  assertCan(actor, 'lesson.read', ctx);
  // For new code blocks in a post: the course's language (a web course writes HTML).
  const [c] = await db
    .select({ language: course.defaultLanguage })
    .from(klass)
    .innerJoin(course, eq(course.id, klass.courseId))
    .where(eq(klass.id, classId))
    .limit(1);
  const codeLanguage = c?.language === 'web' ? 'html' : (c?.language ?? 'python');
  const l = await visibleLesson(classId, week, opts.now ?? new Date());
  if (!l) return { open: false, questions: [], toReview: 0, codeLanguage };
  const moderator = can(actor, 'qa.moderate', ctx);
  const teacherIds = new Set(ctx.classTeacherIds);

  const qs = await db
    .select({ q: question, author: user.name })
    .from(question)
    .innerJoin(user, eq(user.id, question.authorId))
    .where(eq(question.lessonId, l.id))
    .orderBy(asc(question.createdAt));
  const rs = qs.length
    ? await db
        .select({ r: reply, author: user.name })
        .from(reply)
        .innerJoin(user, eq(user.id, reply.authorId))
        .where(
          inArray(
            reply.questionId,
            qs.map((x) => x.q.id),
          ),
        )
        .orderBy(asc(reply.createdAt))
    : [];
  const openReports = moderator ? await reportsFor([...qs.map((x) => x.q.id), ...rs.map((x) => x.r.id)]) : new Map<string, Report[]>();

  const view = (p: { id: string; authorId: string; bodyMd: string; createdAt: Date; visibility: string }, author: string): ReplyView => ({
    id: p.id,
    author,
    byTeacher: teacherIds.has(p.authorId),
    mine: p.authorId === actor.userId,
    bodyHtml: renderPost(p.bodyMd),
    createdAt: p.createdAt,
    state: p.visibility as Visibility,
    reports: openReports.get(p.id) ?? [],
  });
  const questions = qs
    .map(({ q, author }) => ({
      ...view(q, author),
      code: q.codeSnippet,
      acceptedReplyId: q.acceptedReplyId,
      replies: rs.filter((x) => x.r.questionId === q.id).map(({ r, author: a }) => view(r, a)),
    }))
    .filter((q) => shownTo(q.state, q.mine, moderator))
    .map((q) => ({ ...q, replies: q.replies.filter((r) => shownTo(r.state, r.mine, moderator)) }));
  const toReview = moderator
    ? questions.filter((q) => q.state === 'under_review').length +
      questions.flatMap((q) => q.replies).filter((r) => r.state === 'under_review').length
    : 0;
  return { open: true, questions, toReview, codeLanguage };
}

async function reportsFor(postIds: string[]) {
  const map = new Map<string, Report[]>();
  if (!postIds.length) return map;
  const rows = await db
    .select({ postId: postReport.postId, by: user.name, reason: postReport.reason })
    .from(postReport)
    .innerJoin(user, eq(user.id, postReport.reporterId))
    .where(and(inArray(postReport.postId, postIds), isNull(postReport.resolvedAt)))
    .orderBy(asc(postReport.createdAt));
  for (const r of rows) map.set(r.postId, [...(map.get(r.postId) ?? []), { by: r.by, reason: r.reason }]);
  return map;
}

// Number of posts waiting for a teacher in each lesson, for the weeks table.
export async function reviewCounts(lessonIds: string[]): Promise<Map<string, number>> {
  const counts = new Map<string, number>();
  if (!lessonIds.length) return counts;
  const qs = await db
    .select({ id: question.id, lessonId: question.lessonId, visibility: question.visibility })
    .from(question)
    .where(inArray(question.lessonId, lessonIds));
  const rs = qs.length
    ? await db
        .select({ questionId: reply.questionId })
        .from(reply)
        .where(
          and(
            inArray(
              reply.questionId,
              qs.map((q) => q.id),
            ),
            eq(reply.visibility, 'under_review'),
          ),
        )
    : [];
  const add = (lessonId: string) => counts.set(lessonId, (counts.get(lessonId) ?? 0) + 1);
  for (const q of qs) if (q.visibility === 'under_review') add(q.lessonId);
  for (const r of rs) add(qs.find((q) => q.id === r.questionId)!.lessonId);
  return counts;
}

export async function askQuestion(
  actor: Actor | null,
  classId: string,
  week: number,
  input: { body: string; code: string },
  opts: Opts = {},
): Promise<{ id: string }> {
  assertCan(actor, 'qa.post', await classAccess(classId));
  const l = await visibleLesson(classId, week, opts.now ?? new Date());
  if (!l) throw new ValidationError('Questions open once the lesson is published.');
  const body = bodySchema('question').safeParse(input.body);
  if (!body.success) throw ValidationError.fromZod(body.error);
  const code = z
    .string()
    .max(MAX, `Keep the code under ${MAX.toLocaleString('en')} characters.`)
    .safeParse(input.code ?? '');
  if (!code.success) throw ValidationError.fromZod(code.error);
  const id = crypto.randomUUID();
  await db
    .insert(question)
    .values({ id, lessonId: l.id, authorId: actor.userId, bodyMd: body.data, codeSnippet: code.data.trim() ? code.data : null });
  return { id };
}

// The question with its class, for posting and moderating.
async function questionInClass(questionId: string) {
  const [row] = await db
    .select({ q: question, classId: classSession.classId })
    .from(question)
    .innerJoin(lesson, eq(lesson.id, question.lessonId))
    .innerJoin(classSession, eq(classSession.id, lesson.sessionId))
    .where(eq(question.id, questionId))
    .limit(1);
  if (!row) throw new ValidationError('That question no longer exists.');
  return { ...row, ctx: await classAccess(row.classId) };
}

export async function replyToQuestion(actor: Actor | null, questionId: string, text: string): Promise<{ id: string }> {
  const { q, ctx } = await questionInClass(questionId);
  assertCan(actor, 'qa.post', ctx);
  if (q.visibility !== 'visible') throw new ValidationError('That question is under review, so it can’t take replies right now.');
  const body = bodySchema('reply').safeParse(text);
  if (!body.success) throw ValidationError.fromZod(body.error);
  const id = crypto.randomUUID();
  await db.insert(reply).values({ id, questionId, authorId: actor.userId, bodyMd: body.data });
  return { id };
}

export async function acceptReply(actor: Actor | null, questionId: string, replyId: string | null) {
  const { ctx } = await questionInClass(questionId);
  assertCan(actor, 'qa.moderate', ctx);
  if (replyId) {
    const [r] = await db.select().from(reply).where(eq(reply.id, replyId)).limit(1);
    if (!r || r.questionId !== questionId) throw new ValidationError('Choose a reply to this question.');
    if (r.visibility !== 'visible') throw new ValidationError('That reply is under review or removed, so it can’t be the answer.');
  }
  await db.update(question).set({ acceptedReplyId: replyId }).where(eq(question.id, questionId));
}

// Finds a post with its author and class.
async function findPost(ref: PostRef): Promise<{ authorId: string; visibility: string; questionId: string; ctx: PolicyContext }> {
  if (ref.type === 'question') {
    const { q, ctx } = await questionInClass(ref.id);
    return { authorId: q.authorId, visibility: q.visibility, questionId: q.id, ctx };
  }
  const [r] = await db.select().from(reply).where(eq(reply.id, ref.id)).limit(1);
  if (!r) throw new ValidationError('That reply no longer exists.');
  const { ctx } = await questionInClass(r.questionId);
  return { authorId: r.authorId, visibility: r.visibility, questionId: r.questionId, ctx };
}

export async function reportPost(actor: Actor | null, ref: PostRef, reason: string) {
  const post = await findPost(ref);
  assertCan(actor, 'qa.post', post.ctx);
  if (post.authorId === actor.userId) throw new ValidationError('You can’t report your own post.');
  if ((post.ctx.classTeacherIds ?? []).includes(post.authorId))
    throw new ValidationError('Teachers’ posts can’t be reported. If something in one is wrong, tell your teacher or the club admin.');
  if (post.visibility === 'hidden') throw new ValidationError('That post has already been removed.');
  const why = z
    .string()
    .trim()
    .max(200, 'Keep the reason under 200 characters.')
    .safeParse(reason ?? '');
  if (!why.success) throw ValidationError.fromZod(why.error);
  await db.transaction(async (tx) => {
    await tx
      .insert(postReport)
      .values({ id: crypto.randomUUID(), postType: ref.type, postId: ref.id, reporterId: actor.userId, reason: why.data || null })
      .onConflictDoNothing();
    await (ref.type === 'question'
      ? tx.update(question).set({ visibility: 'under_review' }).where(eq(question.id, ref.id))
      : tx.update(reply).set({ visibility: 'under_review' }).where(eq(reply.id, ref.id)));
  });
}

// A teacher restores a post (visible again) or removes it (hidden from every student). Open reports on it are
// resolved with that outcome, and the decision goes to the audit log.
export async function moderatePost(actor: Actor | null, ref: PostRef, decision: 'restore' | 'remove') {
  const post = await findPost(ref);
  assertCan(actor, 'qa.moderate', post.ctx);
  const now = new Date();
  await db.transaction(async (tx) => {
    await (ref.type === 'question'
      ? tx
          .update(question)
          .set({ visibility: decision === 'restore' ? 'visible' : 'hidden' })
          .where(eq(question.id, ref.id))
      : tx
          .update(reply)
          .set({ visibility: decision === 'restore' ? 'visible' : 'hidden' })
          .where(eq(reply.id, ref.id)));
    if (ref.type === 'reply' && decision === 'remove')
      await tx
        .update(question)
        .set({ acceptedReplyId: null })
        .where(and(eq(question.id, post.questionId), eq(question.acceptedReplyId, ref.id)));
    const resolved = await tx
      .update(postReport)
      .set({ resolvedBy: actor.userId, resolvedAt: now, outcome: decision === 'restore' ? 'restored' : 'removed' })
      .where(and(eq(postReport.postType, ref.type), eq(postReport.postId, ref.id), isNull(postReport.resolvedAt)))
      .returning({ id: postReport.id });
    await audit(
      {
        actorId: actor.userId,
        action: `qa.${decision}`,
        entity: ref.type,
        entityId: ref.id,
        detail: { type: ref.type, id: ref.id, reports: resolved.length, authorId: post.authorId },
      },
      tx,
    );
  });
}
