// Courses and their syllabus (FR-ADM-04).
import { and, asc, eq, ne, sql } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import { db } from '@/db/client';
import { course, syllabusTopic } from '@/db/schema';
import type { Actor } from '@/server/actor';
import { audit } from '@/server/audit';
import { assertCan, ValidationError } from '@/server/errors';
import { courseInputSchema, parseSyllabus, wouldCreateCycle, type CourseInput } from './rules';

export type Course = typeof course.$inferSelect;
export type CourseSummary = Course & { nextCourseCode: string | null; topicCount: number };
export type CourseDetail = Course & { topics: { id: string; position: number; title: string }[] };

function parse(raw: CourseInput) {
  const parsed = courseInputSchema.safeParse(raw);
  if (!parsed.success) throw ValidationError.fromZod(parsed.error);
  return parsed.data;
}

async function checkCodeAndLevel(id: string | null, code: string, nextCourseId: string | null | undefined) {
  const [clash] = await db
    .select({ name: course.name })
    .from(course)
    .where(id ? and(eq(course.code, code), ne(course.id, id)) : eq(course.code, code))
    .limit(1);
  if (clash) throw new ValidationError(`The code ${code} is already used by ${clash.name}.`, 'code');
  if (!nextCourseId) return;
  const links = new Map((await db.select({ id: course.id, next: course.nextCourseId }).from(course)).map((r) => [r.id, r.next]));
  if (!links.has(nextCourseId)) throw new ValidationError('Choose a next level from the list.', 'nextCourseId');
  if (id && wouldCreateCycle(id, nextCourseId, links)) throw new ValidationError('That would make a loop of next levels.', 'nextCourseId');
}

export async function listCourses(actor: Actor | null): Promise<CourseSummary[]> {
  assertCan(actor, 'courses.manage');
  const next = alias(course, 'next_course');
  const rows = await db
    .select({
      c: course,
      nextCourseCode: next.code,
      topicCount: sql<number>`(select count(*)::int from ${syllabusTopic} where ${syllabusTopic.courseId} = ${course.id})`,
    })
    .from(course)
    .leftJoin(next, eq(next.id, course.nextCourseId))
    .orderBy(asc(course.code));
  return rows.map((r) => ({ ...r.c, nextCourseCode: r.nextCourseCode, topicCount: r.topicCount }));
}

export async function getCourse(actor: Actor | null, id: string): Promise<CourseDetail> {
  assertCan(actor, 'courses.manage');
  const [c] = await db.select().from(course).where(eq(course.id, id)).limit(1);
  if (!c) throw new ValidationError('That course no longer exists.');
  const topics = await db
    .select({ id: syllabusTopic.id, position: syllabusTopic.position, title: syllabusTopic.title })
    .from(syllabusTopic)
    .where(eq(syllabusTopic.courseId, id))
    .orderBy(asc(syllabusTopic.position));
  return { ...c, topics };
}

export async function createCourse(actor: Actor | null, raw: CourseInput): Promise<Course> {
  assertCan(actor, 'courses.manage');
  const c = parse(raw);
  await checkCodeAndLevel(null, c.code, c.nextCourseId);
  return db.transaction(async (tx) => {
    const [created] = await tx
      .insert(course)
      .values({ id: crypto.randomUUID(), ...c, nextCourseId: c.nextCourseId ?? null })
      .returning();
    await audit({ actorId: actor.userId, action: 'course.create', entity: 'course', entityId: created!.id, detail: { code: c.code } }, tx);
    return created!;
  });
}

export async function updateCourse(actor: Actor | null, id: string, raw: CourseInput): Promise<void> {
  assertCan(actor, 'courses.manage');
  const c = parse(raw);
  await checkCodeAndLevel(id, c.code, c.nextCourseId);
  await db.transaction(async (tx) => {
    const res = await tx
      .update(course)
      .set({ ...c, description: c.description ?? null, nextCourseId: c.nextCourseId ?? null })
      .where(eq(course.id, id))
      .returning({ id: course.id });
    if (!res.length) throw new ValidationError('That course no longer exists.');
    await audit({ actorId: actor.userId, action: 'course.update', entity: 'course', entityId: id, detail: { code: c.code } }, tx);
  });
}

// Saves the topics in the new order. Topics whose title is unchanged keep their id, so lessons linked to
// them (M3) stay linked; removed topics are deleted.
export async function setSyllabus(actor: Actor | null, courseId: string, text: string): Promise<void> {
  assertCan(actor, 'courses.manage');
  let titles: string[];
  try {
    titles = parseSyllabus(text);
  } catch (err) {
    throw new ValidationError((err as Error).message, 'syllabus');
  }
  await db.transaction(async (tx) => {
    const existing = await tx
      .select({ id: syllabusTopic.id, title: syllabusTopic.title })
      .from(syllabusTopic)
      .where(eq(syllabusTopic.courseId, courseId));
    const byTitle = new Map(existing.map((t) => [t.title, t.id]));
    const keep = new Set<string>();
    for (const [i, title] of titles.entries()) {
      const id = byTitle.get(title);
      if (id && !keep.has(id)) {
        keep.add(id);
        await tx
          .update(syllabusTopic)
          .set({ position: i + 1 })
          .where(eq(syllabusTopic.id, id));
      } else {
        await tx.insert(syllabusTopic).values({ id: crypto.randomUUID(), courseId, position: i + 1, title });
      }
    }
    for (const t of existing) if (!keep.has(t.id)) await tx.delete(syllabusTopic).where(eq(syllabusTopic.id, t.id));
    await audit(
      { actorId: actor.userId, action: 'course.syllabus', entity: 'course', entityId: courseId, detail: { topics: titles.length } },
      tx,
    );
  });
}
