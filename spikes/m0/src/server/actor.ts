// The one way server code finds out who is calling. Applies the per-role session rules (FR-AUTH-10).
import { eq } from 'drizzle-orm';
import { db } from '@/db/client';
import { session } from '@/db/schema';
import { sessionDecision } from '@/lib/session-policy';
import { auth } from './auth';

export type Actor = { userId: string; username: string; name: string; role: string; sessionId: string };

export async function getActor(headers: Headers): Promise<Actor | null> {
  const found = await auth.api.getSession({ headers, query: { disableCookieCache: true } });
  if (!found) return null;
  const s = found.session as typeof found.session & { lastActiveAt?: Date | string | null };
  const now = new Date();
  const decision = sessionDecision({
    role: found.user.role ?? '',
    createdAt: new Date(s.createdAt),
    lastActiveAt: new Date(s.lastActiveAt ?? s.createdAt),
    now,
  });
  if (!decision.valid) {
    await db.delete(session).where(eq(session.id, s.id));
    return null;
  }
  if (decision.touch) await db.update(session).set({ lastActiveAt: now }).where(eq(session.id, s.id));
  return { userId: found.user.id, username: found.user.username ?? '', name: found.user.name, role: found.user.role ?? '', sessionId: s.id };
}
