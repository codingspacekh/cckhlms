// FR-AUTH-06 (M13): My account for admins and teachers: who they are, and Change password.
import { PageHeader } from '@/components/ui/PageHeader';
import type { Actor } from '@/server/actor';
import { ChangePasswordForm } from './ChangePasswordForm';

const FORGOT = {
  admin: 'Forgot your current password? Another admin can reset it on People. If no admin can sign in, see runbook §3.2.',
  teacher: 'Forgot your current password? Ask an admin to reset it on People.',
};

export function MyAccount({ actor, role }: { actor: Actor; role: 'admin' | 'teacher' }) {
  return (
    <>
      <PageHeader title="My account" />
      <div className="stack">
        <section className="card stack" aria-labelledby="details-title">
          <h2 id="details-title">Your details</h2>
          <dl className="grid g3 account-details">
            <div>
              <dt className="xs muted">Name</dt>
              <dd>{actor.name}</dd>
            </div>
            <div>
              <dt className="xs muted">Username</dt>
              <dd>{actor.username}</dd>
            </div>
            <div>
              <dt className="xs muted">Role</dt>
              <dd>{role === 'admin' ? 'Admin' : 'Teacher'}</dd>
            </div>
          </dl>
          <p className="small muted">To change your name or username, ask an admin.</p>
        </section>
        <section className="card stack" aria-labelledby="password-title">
          <div>
            <h2 id="password-title">Change password</h2>
            <p className="small muted">You stay signed in here. Any other computer or phone signed in as you is signed out.</p>
          </div>
          <ChangePasswordForm forgotHint={FORGOT[role]} />
        </section>
      </div>
    </>
  );
}
