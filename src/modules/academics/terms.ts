// Terms (FR-ADM-03): planned → active → closed, at most one active, no overlapping dates.
import { and, asc, desc, eq, gte, lte, ne } from 'drizzle-orm';
import { db } from '@/db/client';
import { term } from '@/db/schema';
import type { Actor } from '@/server/actor';
import { audit } from '@/server/audit';
import { assertCan, ValidationError } from '@/server/errors';
import { termInputSchema, termName, type TermInput } from './rules';

export type TermStatus = 'planned' | 'active' | 'closed';
export type Term = typeof term.$inferSelect;

const NEXT: Record<TermStatus, TermStatus | null> = { planned: 'active', active: 'closed', closed: null };

export async function listTerms(actor: Actor | null): Promise<Term[]> {
  assertCan(actor, 'terms.manage');
  return db.select().from(term).orderBy(desc(term.startDate), asc(term.number));
}

export async function createTerm(actor: Actor | null, raw: TermInput): Promise<Term> {
  assertCan(actor, 'terms.manage');
  const parsed = termInputSchema.safeParse(raw);
  if (!parsed.success) throw ValidationError.fromZod(parsed.error);
  const t = parsed.data;
  const name = termName(t.year, t.number);

  const [same] = await db
    .select({ id: term.id })
    .from(term)
    .where(and(eq(term.year, t.year), eq(term.number, t.number)))
    .limit(1);
  if (same) throw new ValidationError(`${name} already exists.`, 'number');
  const [overlap] = await db
    .select({ name: term.name })
    .from(term)
    .where(and(lte(term.startDate, t.endDate), gte(term.endDate, t.startDate)))
    .limit(1);
  if (overlap) throw new ValidationError(`These dates overlap ${overlap.name}.`, 'startDate');

  return db.transaction(async (tx) => {
    const [created] = await tx
      .insert(term)
      .values({ id: crypto.randomUUID(), year: t.year, number: t.number, name, startDate: t.startDate, endDate: t.endDate })
      .returning();
    await audit({ actorId: actor.userId, action: 'term.create', entity: 'term', entityId: created!.id, detail: { name } }, tx);
    return created!;
  });
}

export async function setTermStatus(actor: Actor | null, id: string, status: TermStatus) {
  assertCan(actor, 'terms.manage');
  const [t] = await db.select().from(term).where(eq(term.id, id)).limit(1);
  if (!t) throw new ValidationError('That term no longer exists.');
  if (NEXT[t.status as TermStatus] !== status) {
    throw new ValidationError(
      t.status === 'closed' ? `${t.name} is closed.` : `${t.name} is ${t.status}; it can only become ${NEXT[t.status as TermStatus]} next.`,
    );
  }
  if (status === 'active') {
    const [other] = await db
      .select({ name: term.name })
      .from(term)
      .where(and(eq(term.status, 'active'), ne(term.id, id)))
      .limit(1);
    if (other) throw new ValidationError(`Close ${other.name} first: only one term can be active.`);
  }
  await db.transaction(async (tx) => {
    await tx.update(term).set({ status }).where(eq(term.id, id));
    await audit({ actorId: actor.userId, action: 'term.status', entity: 'term', entityId: id, detail: { status } }, tx);
  });
}
