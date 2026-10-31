// FR-AUTH-06 (M13, M16a): My account for everyone: who they are, their profile picture (owner, 2026-10-31), and Change
// password, which opens in a dialog (owner, 2026-11-01).
import { PageHeader } from '@/components/ui/PageHeader';
import type { Actor } from '@/server/actor';
import { ChangePassword } from './ChangePassword';
import { ProfilePicture } from './ProfilePicture';

const FORGOT = {
  admin: 'Forgot your current password? Another admin can reset it on People. If no admin can sign in, see runbook §3.2.',
  teacher: 'Forgot your current password? Ask an admin to reset it on People.',
  student: 'Forgot your password? Ask your teacher or the club admin for a new login slip.',
};
const ROLE = { admin: 'Admin', teacher: 'Teacher', student: 'Student' };

export function MyAccount({ actor, role, image = null }: { actor: Actor; role: 'admin' | 'teacher' | 'student'; image?: string | null }) {
  const student = role === 'student';
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
              <dd>{ROLE[role]}</dd>
            </div>
          </dl>
          <p className="small muted">To change your name or username, ask {student ? 'the club admin' : 'an admin'}.</p>
        </section>
        <section className="card stack" aria-labelledby="picture-title">
          <h2 id="picture-title">Profile picture</h2>
          <ProfilePicture userId={actor.userId} image={image} />
        </section>
        <section className="card stack" aria-labelledby="password-title">
          <div>
            <h2 id="password-title">Password</h2>
            <p className="small muted">
              Changing it keeps you signed in here. Any other computer or phone signed in as you is signed out.
              {student && ' The password on your login slip stops working.'}
            </p>
          </div>
          <ChangePassword
            help={student ? 'At least 12 characters. Three words with dashes are easy to remember, like on your login slip.' : undefined}
          />
          <p className="xs muted">{FORGOT[role]}</p>
        </section>
      </div>
    </>
  );
}
