// FR-AUTH-11 (M7): failed sign-ins are limited per username and per address, a minute at a time. Only failures
// count, so a whole class can sign in together from the club's one Wi-Fi address. A right password clears the
// username's count but not the address's, so one known account can't be used to keep guessing others. Since M17c
// a username's attempt is counted before its password is checked and given back if it wasn't a wrong password, so
// attempts sent all at once get no more checks than attempts sent one by one.
// The window runs on the database's clock, like the rest of the session rules.
import { and, eq, gt, lt, sql } from 'drizzle-orm';
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

const expired = sql`${signInFailure.windowStart} <= ${WINDOW}`;

// Adds one to a key's count in this minute (a new minute starts at 1) and returns the count, in one statement.
async function bump(key: string): Promise<number> {
  const [row] = await db
    .insert(signInFailure)
    .values({ key, count: 1, windowStart: sql`now()` })
    .onConflictDoUpdate({
      target: signInFailure.key,
      set: {
        count: sql`case when ${expired} then 1 else ${signInFailure.count} + 1 end`,
        windowStart: sql`case when ${expired} then now() else ${signInFailure.windowStart} end`,
      },
    })
    .returning({ count: signInFailure.count });
  return row!.count;
}

// Before the password is checked: which limit, if any, refuses this sign-in. The username's attempt is counted here,
// in one statement, so attempts sent at the same moment can't all see the old count (M17c, F13); settleSignIn keeps
// it only if the password was wrong. The address's count is only read: a class signs in together from one address,
// and Better Auth's flood guard (60 a minute per address) already bounds what one address can send at once.
export async function reserveSignIn(username: string, ip: string | null): Promise<'user' | 'ip' | null> {
  const k = keysFor(username, ip);
  if (k.ip) {
    const [row] = await db
      .select({ count: signInFailure.count })
      .from(signInFailure)
      .where(and(eq(signInFailure.key, k.ip), gt(signInFailure.windowStart, WINDOW)));
    if (row && row.count >= SIGN_IN_LIMITS.ip) return 'ip';
  }
  return (await bump(k.user)) > SIGN_IN_LIMITS.user ? 'user' : null;
}

// After it: a wrong password ('failed') stays counted for the username and counts for the address; the right one
// ('ok') clears the username's count but not the address's, so one known account can't be used to keep guessing
// others. Anything else (a switched-off account, a malformed request: M17c, F12) wasn't a guess, so the username's
// count goes back to what it was.
export async function settleSignIn(username: string, ip: string | null, outcome: 'ok' | 'failed' | 'other') {
  const k = keysFor(username, ip);
  if (outcome === 'ok') {
    await db.delete(signInFailure).where(eq(signInFailure.key, k.user));
    return;
  }
  if (outcome === 'other') {
    await db
      .update(signInFailure)
      .set({ count: sql`greatest(${signInFailure.count} - 1, 0)` })
      .where(and(eq(signInFailure.key, k.user), gt(signInFailure.windowStart, WINDOW)));
    return;
  }
  // Rows are only needed for a minute; anything older than a day (usernames, addresses) is removed, here and in
  // Better Auth's flood-guard table.
  await db.delete(signInFailure).where(lt(signInFailure.windowStart, sql`now() - interval '1 day'`));
  await db.delete(rateLimit).where(lt(rateLimit.lastRequest, Date.now() - 24 * 3600 * 1000));
  if (k.ip) await bump(k.ip);
}
