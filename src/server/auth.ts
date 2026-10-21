// Better Auth (ADR 0003): username + password only, accounts created by Admin, no public sign-up.
import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { APIError, createAuthMiddleware } from 'better-auth/api';
import { admin, username } from 'better-auth/plugins';
import { db } from '@/db/client';
import * as schema from '@/db/schema';
import { audit } from './audit';
import { recordSignIn, signInRefusal } from './sign-in-limit';

const DAY = 24 * 3600;
export const LMS_ORIGIN = process.env.BETTER_AUTH_URL ?? 'http://lms.localhost:3000';

// ADR 0003 finding 2: Better Auth checks Origin only when the request already has a cookie, and the username
// sign-in has no first-login CSRF check. So every browser POST must come from the LMS itself.
function requireLmsOrigin(request: Request | undefined) {
  if (request?.method !== 'POST') return; // server-side calls (auth.api.*) have no request
  if (request.headers.get('origin') !== LMS_ORIGIN) throw new APIError('FORBIDDEN', { message: 'Request not allowed from this site.' });
}

// FR-AUTH-11: failed sign-ins are limited per username and per address (sign-in-limit.ts).
const SIGN_IN = '/sign-in/username';
const signInAttempt = (ctx: { body?: unknown; headers?: Headers }) => {
  const username = (ctx.body as { username?: unknown } | undefined)?.username;
  return typeof username === 'string' ? { username, ip: ctx.headers?.get('cf-connecting-ip') ?? null } : null;
};
const REFUSED = {
  user: 'Too many tries for this username. Wait a minute and try again.',
  ip: 'Too many tries from this network. Wait a minute and try again.',
};

const beforeHook = createAuthMiddleware(async (ctx) => {
  requireLmsOrigin(ctx.request);
  const attempt = ctx.path === SIGN_IN ? signInAttempt(ctx) : null;
  if (!attempt) return;
  const refused = await signInRefusal(attempt.username, attempt.ip);
  if (refused) throw new APIError('TOO_MANY_REQUESTS', { message: REFUSED[refused] });
});

const afterHook = createAuthMiddleware(async (ctx) => {
  const attempt = ctx.path === SIGN_IN ? signInAttempt(ctx) : null;
  if (!attempt) return;
  const r = ctx.context.returned;
  // A wrong username or password is 401; a switched-off account (403) knew its password, so it isn't a guess.
  if (r instanceof APIError) {
    if (r.statusCode === 401) await recordSignIn(attempt.username, attempt.ip, false);
  } else await recordSignIn(attempt.username, attempt.ip, true);
});

export const auth = betterAuth({
  appName: 'CCKH LMS',
  baseURL: process.env.BETTER_AUTH_URL,
  secret: process.env.BETTER_AUTH_SECRET,
  trustedOrigins: [LMS_ORIGIN],
  hooks: { before: beforeHook, after: afterHook },
  database: drizzleAdapter(db, {
    provider: 'pg',
    schema: {
      user: schema.user,
      session: schema.session,
      account: schema.account,
      verification: schema.verification,
      rateLimit: schema.rateLimit,
    },
  }),
  emailAndPassword: { enabled: true, disableSignUp: true, minPasswordLength: 10 },
  // Outer limit for everyone; the stricter student rules are enforced in getActor() (src/server/actor.ts).
  session: {
    expiresIn: 7 * DAY,
    updateAge: DAY,
    additionalFields: { lastActiveAt: { type: 'date', required: false, input: false } },
  },
  rateLimit: {
    enabled: true,
    storage: 'database',
    window: 60,
    max: 100,
    // A flood guard per address. Guessing is limited by failed sign-ins (beforeHook); this is loose enough for two
    // classes signing in on one Wi-Fi in the same minute.
    customRules: { '/sign-in/username': { window: 60, max: 60 } },
  },
  advanced: { ipAddress: { ipAddressHeaders: ['cf-connecting-ip'] } },
  databaseHooks: {
    session: {
      create: {
        before: async (s) => ({ data: { ...s, lastActiveAt: new Date() } }),
        after: async (s) => audit({ actorId: s.userId, action: 'auth.sign_in', ip: s.ipAddress }),
      },
    },
  },
  plugins: [username({ minUsernameLength: 3, maxUsernameLength: 30 }), admin({ defaultRole: 'student', adminRoles: ['admin'] })],
});
