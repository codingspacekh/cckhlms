// Creates an account directly (first admin, tests). Real accounts are created by Admin in the UI.
import { auth } from './auth';

export async function seedUser(u: { username: string; name: string; password: string; role: string }) {
  const ctx = await auth.$context;
  const user = await ctx.internalAdapter.createUser(
    {
      name: u.name,
      email: `${u.username}@users.cckh.invalid`,
      emailVerified: false,
      username: u.username,
      displayUsername: u.username,
      role: u.role,
    },
    { method: 'admin' },
  );
  await ctx.internalAdapter.linkAccount({
    userId: user.id,
    providerId: 'credential',
    accountId: user.id,
    password: await ctx.password.hash(u.password),
  });
  return user;
}
