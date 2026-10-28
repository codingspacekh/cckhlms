// FR-AUTH-11 (M7): failed sign-ins are limited per username and per address, a minute at a time. Only failures
// count, so a whole class can sign in together from the club's one Wi-Fi address. A right password clears the
// username's count but not the address's, so one known account can't be used to keep guessing others.
// The window runs on the database's clock, like the rest of the session rules.
import { and, eq, gt, inArray, lt, sql } from 'drizzle-orm';
import { db } from '@/db/client';
import { rateLimit, signInFailure } from '@/db/schema';

export const SIGN_IN_LIMITS = { user: 5, ip: 10 } as const;
const WINDOW = sql`now() - interval '60 seconds'`;

// An IPv6 connection gets a whole /64, so that is what counts (pre-launch review); IPv4 counts per address.
export function addressKey(ip: string): string {
  const v4 = ip.match(/^(?:::ffff:)?(\d{1,3}(?:\.\d{1,3}){3})$/i);
  if (v4) return v4[1]!;
  if (!/^[0-9a-f:]+$/i.test(ip) || !ip.includes(':')) return ip;
  const [head = '', tail] = ip.toLowerCase().split('::');
  const front = head ? head.split(':') : [];
  const groups = tail === undefined ? front : [...front, ...Array(8).fill('0')].slice(0, Math.max(front.length, 4));
  return `${groups
    .slice(0, 4)
    .map((g) => g.replace(/^0+(?=.)/, ''))
    .join(':')}::/64`;
}

const keysFor = (username: string, ip: string | null) => ({
  user: `user:${username.trim().toLowerCase()}`,
  ip: ip ? `ip:${addressKey(ip)}` : null, // no address outside Cloudflare (local runs): the username limit still applies
});

// Which limit, if any, this sign-in is over.
export async function signInRefusal(username: string, ip: string | null): Promise<'user' | 'ip' | null> {
  const k = keysFor(username, ip);
  const rows = await db
    .select({ key: signInFailure.key, count: signInFailure.count })
    .from(signInFailure)
    .where(and(inArray(signInFailure.key, [k.user, ...(k.ip ? [k.ip] : [])]), gt(signInFailure.windowStart, WINDOW)));
  const over = (key: string | null, limit: number) => rows.some((r) => r.key === key && r.count >= limit);
  if (over(k.user, SIGN_IN_LIMITS.user)) return 'user';
  if (over(k.ip, SIGN_IN_LIMITS.ip)) return 'ip';
  return null;
}

export async function recordSignIn(username: string, ip: string | null, ok: boolean) {
  const k = keysFor(username, ip);
  if (ok) {
    await db.delete(signInFailure).where(eq(signInFailure.key, k.user));
    return;
  }
  // Rows are only needed for a minute; anything older than a day (usernames, addresses) is removed, here and in
  // Better Auth's flood-guard table.
  await db.delete(signInFailure).where(lt(signInFailure.windowStart, sql`now() - interval '1 day'`));
  await db.delete(rateLimit).where(lt(rateLimit.lastRequest, Date.now() - 24 * 3600 * 1000));
  for (const key of [k.user, k.ip]) {
    if (!key) continue;
    const expired = sql`${signInFailure.windowStart} <= ${WINDOW}`;
    await db
      .insert(signInFailure)
      .values({ key, count: 1, windowStart: sql`now()` })
      .onConflictDoUpdate({
        target: signInFailure.key,
        set: {
          count: sql`case when ${expired} then 1 else ${signInFailure.count} + 1 end`,
          windowStart: sql`case when ${expired} then now() else ${signInFailure.windowStart} end`,
        },
      });
  }
}
