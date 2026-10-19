// Better Auth (ADR 0003): username + password only, accounts created by Admin, no public sign-up.
import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { APIError, createAuthMiddleware } from 'better-auth/api';
import { admin, username } from 'better-auth/plugins';
import { db } from '@/db/client';
import * as schema from '@/db/schema';
import { audit } from './audit';

const DAY = 24 * 3600;
export const LMS_ORIGIN = process.env.BETTER_AUTH_URL ?? 'http://lms.localhost:3000';

// ADR 0003 finding 2: Better Auth checks Origin only when the request already has a cookie, and the username
// sign-in has no first-login CSRF check. So every browser POST must come from the LMS itself.
const requireLmsOrigin = createAuthMiddleware(async (ctx) => {
  if (ctx.request?.method !== 'POST') return; // server-side calls (auth.api.*) have no request
  if (ctx.request.headers.get('origin') !== LMS_ORIGIN) throw new APIError('FORBIDDEN', { message: 'Request not allowed from this site.' });
});

export const auth = betterAuth({
  appName: 'CCKH LMS',
  baseURL: process.env.BETTER_AUTH_URL,
  secret: process.env.BETTER_AUTH_SECRET,
  trustedOrigins: [LMS_ORIGIN],
  hooks: { before: requireLmsOrigin },
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
    customRules: { '/sign-in/username': { window: 60, max: 5 } },
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
