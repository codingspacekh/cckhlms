import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { ClubLogo } from '@/components/shell/ClubLogo';
import { currentActor } from '@/server/guard';
import { homeFor } from '@/server/policy';
import { LoginForm } from './LoginForm';

export const metadata: Metadata = { title: 'Sign in' };

export default async function LoginPage() {
  const actor = await currentActor();
  if (actor) redirect(homeFor(actor));
  return (
    <main className="center">
      <div className="card stack narrow">
        <div className="brand">
          <ClubLogo />
        </div>
        <div>
          <h1>Sign in</h1>
          <p className="small muted">Use the username and password from your login slip.</p>
        </div>
        <LoginForm />
        <p className="xs muted">
          Forgot your password? Ask your teacher or the club admin to reset it. On a shared laptop you&apos;ll be signed out after 2 hours
          without activity.
        </p>
      </div>
    </main>
  );
}
