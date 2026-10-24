// A student's "My week" (FR-STU-01, FR-STU-11, M8): their classes with the next session and the term puzzle, what
// they still have to do, recent marks, the latest feedback from a teacher, and their latest Playground project.
// Only the student's own work and marks (BR-11).
import { and, desc, eq, inArray, ne, sql } from 'drizzle-orm';
import { db } from '@/db/client';
import { assessment, attendance, playgroundProject, submission, user } from '@/db/schema';
import { myClasses, type MyClass } from '@/modules/academics/enrolments';
import { todayIn } from '@/modules/academics/schedule';
import { formatDue, type Kind } from '@/modules/assessments/rules';
import { studentClassWork } from '@/modules/assessments/service';
import { myStanding } from '@/modules/assessments/submissions';
import type { AttendanceStatus } from '@/modules/attendance/rules';
import { getClubSettings } from '@/modules/club/service';
import { weeksOf } from '@/modules/teaching/weeks';
import type { Actor } from '@/server/actor';
import { assertCan } from '@/server/errors';
import { termPuzzle } from './puzzle-rules';
import { myClassStanding } from './standing';

type Opts = { now?: Date };

export type HomeClass = MyClass & { puzzle: ReturnType<typeof termPuzzle> };
export type HomeTodo = {
  id: string;
  classId: string;
  className: string;
  title: string;
  kind: Kind;
  dueLabel: string;
  state: 'missing' | 'not_due' | 'returned';
};
export type HomeMark = { id: string; classId: string; title: string; kind: Kind; score: number; maxScore: number };
export type HomeFeedback = { classId: string; workId: string; title: string; teacher: string | null; text: string; at: Date | null };
export type HomeProject = { id: string; name: string; language: string; savedAt: Date; path: string; lines: string[] };

const TODO_LIMIT = 5;
const MARKS_LIMIT = 3;
const PREVIEW_LINES = 6;

// The file a project preview shows: the usual first file for its language, else the first file that isn't a picture.
function previewFile(language: string, files: { path: string; content: string }[]) {
  const code = files.filter((f) => !f.content.startsWith('data:'));
  const main = { python: /(^|\/)main\.py$/, web: /(^|\/)index\.html$/, java: /\.java$/ }[language];
  return code.find((f) => main?.test(f.path)) ?? code[0] ?? null;
}

export async function studentHome(actor: Actor | null, opts: Opts = {}) {
  assertCan(actor, 'student.area');
  const now = opts.now ?? new Date();
  const [found, { timeZone }] = await Promise.all([myClasses(actor, { now }), getClubSettings()]);
  const today = todayIn(timeZone, now);

  const classes: HomeClass[] = [];
  const todo: (HomeTodo & { dueAt: number })[] = [];
  const marks: (HomeMark & { week: number })[] = [];
  for (const c of found) {
    const [work, standing, sessions] = await Promise.all([
      studentClassWork(actor, c.id),
      myClassStanding(actor, c.id, { now }),
      weeksOf(c.id),
    ]);
    if (!standing) continue;
    const [mine, marked] = await Promise.all([
      myStanding(actor, c.id, work, { now }),
      db
        .select({ sessionId: attendance.sessionId, status: attendance.status })
        .from(attendance)
        .where(eq(attendance.enrolmentId, standing.enrolmentId)),
    ]);
    const statusOf = new Map(marked.map((m) => [m.sessionId, m.status as AttendanceStatus]));
    classes.push({
      ...c,
      puzzle: termPuzzle({
        sessions: sessions.map((s) => ({ week: s.week, date: s.date, cancelled: s.cancelled, status: statusOf.get(s.id) ?? null })),
        tasks: standing.tasks.map((t) => ({ week: t.week, state: t.state })),
        enrolledOn: standing.enrolledOn,
        next: c.nextSession?.date ?? null,
      }),
    });
    for (const w of work) {
      const m = mine.get(w.id);
      if (!m) continue;
      if (m.mark === 'graded' && m.score !== null) {
        marks.push({ id: w.id, classId: c.id, title: w.title, kind: w.kind, score: m.score, maxScore: w.maxScore, week: w.week ?? 0 });
        continue;
      }
      // Paper work and exams are marked in the gradebook: there's nothing to do for them here.
      if (w.language === 'paper') continue;
      const state = m.mark === 'returned' ? 'returned' : m.status === 'missing' || m.status === 'not_due' ? m.status : null;
      if (!state || (m.mark && state !== 'returned')) continue;
      todo.push({
        id: w.id,
        classId: c.id,
        className: c.name,
        title: w.title,
        kind: w.kind,
        dueLabel: formatDue(w.due, timeZone),
        state,
        dueAt: w.due?.getTime() ?? Number.MAX_SAFE_INTEGER,
      });
    }
  }

  const classIds = classes.map((c) => c.id);
  const [feedbackRow, projectRow] = await Promise.all([
    classIds.length
      ? db
          .select({
            classId: assessment.classId,
            workId: assessment.id,
            title: assessment.title,
            teacher: user.name,
            text: submission.feedbackMd,
            at: sql<Date | null>`coalesce(${submission.gradedAt}, ${submission.returnedAt})`.mapWith((v: string | null) =>
              v ? new Date(v) : null,
            ),
          })
          .from(submission)
          .innerJoin(assessment, eq(assessment.id, submission.assessmentId))
          .leftJoin(user, eq(user.id, submission.gradedBy))
          .where(and(eq(submission.studentId, actor.userId), ne(submission.feedbackMd, ''), inArray(assessment.classId, classIds)))
          .orderBy(sql`coalesce(${submission.gradedAt}, ${submission.returnedAt}) desc nulls last`)
          .limit(1)
          .then((r) => r[0])
      : undefined,
    db
      .select({
        id: playgroundProject.id,
        name: playgroundProject.name,
        language: playgroundProject.language,
        files: playgroundProject.files,
        savedAt: playgroundProject.updatedAt,
      })
      .from(playgroundProject)
      .where(eq(playgroundProject.ownerId, actor.userId))
      .orderBy(desc(playgroundProject.updatedAt))
      .limit(1)
      .then((r) => r[0]),
  ]);

  const file = projectRow && previewFile(projectRow.language, projectRow.files);
  return {
    today,
    classes,
    todo: todo
      .sort((a, b) => Number(b.state === 'returned') - Number(a.state === 'returned') || a.dueAt - b.dueAt)
      .slice(0, TODO_LIMIT)
      .map(({ dueAt: _, ...t }) => t),
    marks: marks
      .sort((a, b) => b.week - a.week)
      .slice(0, MARKS_LIMIT)
      .map(({ week: _, ...m }) => m),
    feedback: feedbackRow
      ? ({
          classId: feedbackRow.classId,
          workId: feedbackRow.workId,
          title: feedbackRow.title,
          teacher: feedbackRow.teacher,
          text: feedbackRow.text.replace(/\s+/g, ' ').trim(),
          at: feedbackRow.at,
        } satisfies HomeFeedback)
      : null,
    project: projectRow
      ? ({
          id: projectRow.id,
          name: projectRow.name,
          language: projectRow.language,
          savedAt: projectRow.savedAt,
          path: file?.path ?? '',
          lines: (file?.content ?? '').split('\n').slice(0, PREVIEW_LINES),
        } satisfies HomeProject)
      : null,
  };
}

export type StudentHome = Awaited<ReturnType<typeof studentHome>>;
