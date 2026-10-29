// Terms (FR-ADM-03, FR-ADM-14): planned → active → closed, at most one active, no overlapping dates. Closing a term
// archives its classes. Each step can be undone, and a term with no classes can be deleted (M10, BR-23, BR-24).
import { and, asc, count, desc, eq, gte, isNull, lte, max, min, ne } from 'drizzle-orm';
import { db } from '@/db/client';
import { classSession, klass, term } from '@/db/schema';
import type { Actor } from '@/server/actor';
import { audit } from '@/server/audit';
import { assertCan, ValidationError } from '@/server/errors';
import { termInputSchema, termName, type TermInput } from './rules';
import { formatDate } from './schedule';

export type TermStatus = 'planned' | 'active' | 'closed';
export type Term = typeof term.$inferSelect;

// Forward, or back one step to undo it (BR-24): a closed term is reopened as active.
const MOVES: Record<TermStatus, TermStatus[]> = { planned: ['active'], active: ['closed', 'planned'], closed: ['active'] };

export async function listTerms(actor: Actor | null): Promise<Term[]> {
  assertCan(actor, 'terms.manage');
  return db.select().from(term).orderBy(desc(term.startDate), asc(term.number));
}

function parseTerm(raw: TermInput) {
  const parsed = termInputSchema.safeParse(raw);
  if (!parsed.success) throw ValidationError.fromZod(parsed.error);
  return { ...parsed.data, name: termName(parsed.data.year, parsed.data.number) };
}

// No two terms with the same number in a year, and no overlapping dates (a term being edited doesn't count).
async function assertFree(t: ReturnType<typeof parseTerm>, exceptId?: string) {
  const other = exceptId ? ne(term.id, exceptId) : undefined;
  const [same] = await db
    .select({ id: term.id })
    .from(term)
    .where(and(eq(term.year, t.year), eq(term.number, t.number), other))
    .limit(1);
  if (same) throw new ValidationError(`${t.name} already exists.`, 'number');
  const [overlap] = await db
    .select({ name: term.name })
    .from(term)
    .where(and(lte(term.startDate, t.endDate), gte(term.endDate, t.startDate), other))
    .limit(1);
  if (overlap) throw new ValidationError(`These dates overlap ${overlap.name}.`, 'startDate');
}

const span = (t: { startDate: string; endDate: string }) => `${formatDate(t.startDate)} – ${formatDate(t.endDate)}`;

async function findTerm(id: string) {
  const [t] = await db.select().from(term).where(eq(term.id, id)).limit(1);
  if (!t) throw new ValidationError('That term no longer exists.');
  return t;
}

export async function createTerm(actor: Actor | null, raw: TermInput): Promise<Term> {
  assertCan(actor, 'terms.manage');
  const t = parseTerm(raw);
  await assertFree(t);
  return db.transaction(async (tx) => {
    const [created] = await tx
      .insert(term)
      .values({ id: crypto.randomUUID(), year: t.year, number: t.number, name: t.name, startDate: t.startDate, endDate: t.endDate })
      .returning();
    await audit({ actorId: actor.userId, action: 'term.create', entity: 'term', entityId: created!.id, detail: { name: t.name } }, tx);
    return created!;
  });
}

// Fix a term's number or dates (BR-24). Every session of its classes must stay inside the new dates; a cancelled
// session doesn't count.
export async function updateTerm(actor: Actor | null, id: string, raw: TermInput): Promise<void> {
  assertCan(actor, 'terms.manage');
  const t = parseTerm(raw);
  const before = await findTerm(id);
  await assertFree(t, id);
  const [used] = await db
    .select({ first: min(classSession.date), last: max(classSession.date) })
    .from(classSession)
    .innerJoin(klass, eq(klass.id, classSession.classId))
    .where(and(eq(klass.termId, id), ne(classSession.status, 'cancelled')));
  if (used?.first && used.first < t.startDate)
    throw new ValidationError(`A class has a session on ${formatDate(used.first)}, before the new first day.`, 'startDate');
  if (used?.last && used.last > t.endDate)
    throw new ValidationError(`A class has a session on ${formatDate(used.last)}, after the new last day.`, 'endDate');
  await db.transaction(async (tx) => {
    await tx
      .update(term)
      .set({ year: t.year, number: t.number, name: t.name, startDate: t.startDate, endDate: t.endDate })
      .where(eq(term.id, id));
    await audit(
      {
        actorId: actor.userId,
        action: 'term.update',
        entity: 'term',
        entityId: id,
        detail: { name: t.name, dates: span(t), before: `${before.name} · ${span(before)}` },
      },
      tx,
    );
  });
}

// Only a term no class uses (BR-23): anything with classes has history and is closed instead.
export async function deleteTerm(actor: Actor | null, id: string): Promise<void> {
  assertCan(actor, 'terms.manage');
  const t = await findTerm(id);
  const [{ n } = { n: 0 }] = await db.select({ n: count() }).from(klass).where(eq(klass.termId, id));
  if (n > 0) throw new ValidationError(`${t.name} has ${n} class${n === 1 ? '' : 'es'}, so it can't be deleted. Close it instead.`);
  await db.transaction(async (tx) => {
    await tx.delete(term).where(eq(term.id, id));
    await audit({ actorId: actor.userId, action: 'term.delete', entity: 'term', entityId: id, detail: { name: t.name } }, tx);
  });
}

// Returns the term's name and how many classes were archived or reopened, for the message the admin sees.
export async function setTermStatus(actor: Actor | null, id: string, status: TermStatus): Promise<{ name: string; classes: number }> {
  assertCan(actor, 'terms.manage');
  const t = await findTerm(id);
  const from = t.status as TermStatus;
  if (!MOVES[from].includes(status)) {
    throw new ValidationError(`${t.name} is ${from}; it can only become ${MOVES[from].join(' or ')} next.`);
  }
  if (status === 'active') {
    const [other] = await db
      .select({ name: term.name })
      .from(term)
      .where(and(eq(term.status, 'active'), ne(term.id, id)))
      .limit(1);
    if (other) throw new ValidationError(`Close ${other.name} first: only one term can be active.`);
  }
  return db.transaction(async (tx) => {
    let classes = 0;
    await tx.update(term).set({ status }).where(eq(term.id, id));
    await audit(
      { actorId: actor.userId, action: 'term.status', entity: 'term', entityId: id, detail: { status, previousStatus: from } },
      tx,
    );
    // FR-ADM-14: closing the term archives its classes. Nothing is deleted; they stay viewable.
    if (status === 'closed') {
      const archived = await tx
        .update(klass)
        .set({ status: 'archived' })
        .where(and(eq(klass.termId, id), eq(klass.status, 'active')))
        .returning({ id: klass.id });
      classes = archived.length;
      for (const c of archived)
        await audit(
          { actorId: actor.userId, action: 'class.archive', entity: 'class', entityId: c.id, detail: { reason: 'term_closed' } },
          tx,
        );
    }
    // BR-24: reopening undoes that. A class the promotion wizard archived (promotedAt) stays archived.
    if (from === 'closed') {
      const reopened = await tx
        .update(klass)
        .set({ status: 'active' })
        .where(and(eq(klass.termId, id), eq(klass.status, 'archived'), isNull(klass.promotedAt)))
        .returning({ id: klass.id });
      classes = reopened.length;
      for (const c of reopened)
        await audit(
          { actorId: actor.userId, action: 'class.unarchive', entity: 'class', entityId: c.id, detail: { reason: 'term_reopened' } },
          tx,
        );
    }
    return { name: t.name, classes };
  });
}

// The two latest terms that have started by `today` (a club-time date), newest first: what the term-end pages
// (Promotion, Certificates) work on. By date, not status, so a term that wasn't marked active still counts.
export async function latestStartedTerms(today: string): Promise<string[]> {
  const rows = await db.select({ id: term.id }).from(term).where(lte(term.startDate, today)).orderBy(desc(term.startDate)).limit(2);
  return rows.map((r) => r.id);
}
