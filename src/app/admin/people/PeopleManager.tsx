'use client';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useActionState, useRef, useState, useTransition, type ReactNode } from 'react';
import { Icon } from '@/components/ui/Icon';
import { PageHeader } from '@/components/ui/PageHeader';
import { Pill } from '@/components/ui/Pill';
import { TableScroll } from '@/components/ui/TableScroll';
import {
  createAccountAction,
  resetPasswordAction,
  setActiveAction,
  signOutEverywhereAction,
  type ActionResult,
  type Slip,
} from '@/modules/identity/actions';
import type { Person, Role } from '@/modules/identity/service';

// The accounts table takes the full width; adding a person and the one-time login slip open in a dialog.
export function PeopleManager({ people, role, selfId, tabs }: { people: Person[]; role: Role; selfId: string; tabs: ReactNode }) {
  const router = useRouter();
  const dialog = useRef<HTMLDialogElement>(null);
  const [view, setView] = useState<'add' | 'slip' | null>(null);
  const [formKey, setFormKey] = useState(0); // a fresh form each time the dialog opens
  const [slip, setSlip] = useState<Slip | null>(null);
  const [status, setStatus] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, startTransition] = useTransition();

  function openAdd() {
    setFormKey((k) => k + 1);
    setView('add');
    dialog.current?.showModal();
  }
  function showSlip(s: Slip) {
    setSlip(s);
    setView('slip');
    if (!dialog.current?.open) dialog.current?.showModal();
  }

  function act(fn: () => Promise<ActionResult>) {
    startTransition(async () => {
      const r = await fn();
      if (!r.ok) setStatus({ ok: false, text: r.error });
      else {
        if (r.data) showSlip(r.data);
        setStatus(r.message ? { ok: true, text: r.message } : null);
      }
    });
  }

  return (
    <>
      <PageHeader
        eyebrow="Club"
        title="People"
        actions={
          <button type="button" className="btn primary" onClick={openAdd}>
            <Icon name="plus" /> Add a person
          </button>
        }
      />
      {tabs}
      <section className="card flush" aria-label="Accounts">
        {status && (
          <p className={`note ${status.ok ? '' : 'bad'} m16`} role={status.ok ? 'status' : 'alert'}>
            {status.text}
          </p>
        )}
        <TableScroll label="Accounts table">
          <table>
            <thead>
              <tr>
                <th scope="col">Name</th>
                <th scope="col">Username</th>
                {role === 'student' && <th scope="col">Guardian phone</th>}
                <th scope="col">Status</th>
                <th scope="col">
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {people.length === 0 && (
                <tr>
                  <td colSpan={5} className="muted">
                    No accounts yet. Add the first one with “Add a person”.
                  </td>
                </tr>
              )}
              {people.map((p) => (
                <tr key={p.id}>
                  <td className="strong">{p.name}</td>
                  <td className="mono">{p.username}</td>
                  {role === 'student' && <td>{p.guardianPhone ?? '—'}</td>}
                  <td>
                    {p.active ? (
                      <Pill tone="good" icon="check">
                        Active
                      </Pill>
                    ) : (
                      <Pill icon="x">Switched off</Pill>
                    )}
                  </td>
                  <td>
                    <div className="row end nowrap">
                      {role === 'student' && (
                        <Link className="btn sm" href={`/admin/students/${p.id}`} aria-label={`Report for ${p.name}`}>
                          Report
                        </Link>
                      )}
                      <button type="button" className="btn sm" disabled={pending} onClick={() => act(() => resetPasswordAction(p.id))}>
                        Reset password
                      </button>
                      <button
                        type="button"
                        className="btn sm ghost"
                        disabled={pending}
                        onClick={() => act(() => signOutEverywhereAction(p.id))}
                      >
                        Sign out everywhere
                      </button>
                      {p.id !== selfId && (
                        <button
                          type="button"
                          className="btn sm ghost"
                          disabled={pending}
                          onClick={() => act(() => setActiveAction(p.id, !p.active))}
                        >
                          {p.active ? 'Switch off' : 'Switch on'}
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </TableScroll>
      </section>

      <dialog ref={dialog} className="dialog" aria-labelledby="people-dialog-title" onClose={() => setView(null)}>
        {view === 'slip' && slip && <LoginSlip slip={slip} onDone={() => dialog.current?.close()} />}
        {view === 'add' && (
          <AddPersonForm
            key={formKey}
            defaultRole={role}
            onCancel={() => dialog.current?.close()}
            onCreated={(s, createdRole) => {
              showSlip(s);
              // Show the new person in the list: switch to their tab (the slip stays on screen).
              if (createdRole !== role) router.push(`/admin/people?role=${createdRole}`);
            }}
          />
        )}
      </dialog>
    </>
  );
}

function AddPersonForm({
  defaultRole,
  onCreated,
  onCancel,
}: {
  defaultRole: Role;
  onCreated: (slip: Slip, role: Role) => void;
  onCancel: () => void;
}) {
  const [newRole, setNewRole] = useState<Role>(defaultRole);
  const [created, formAction, creating] = useActionState(async (prev: ActionResult | null, form: FormData) => {
    const r = await createAccountAction(prev, form);
    if (r.ok && r.data) onCreated(r.data, String(form.get('role')) as Role);
    return r;
  }, null);

  return (
    <form className="stack" action={formAction} aria-label="Add a person">
      <h2 id="people-dialog-title">Add a person</h2>
      <label className="f">
        Role
        <select name="role" value={newRole} onChange={(e) => setNewRole(e.target.value as Role)}>
          <option value="student">Student</option>
          <option value="teacher">Teacher</option>
          <option value="admin">Admin</option>
        </select>
      </label>
      <label className="f">
        Full name
        <input name="name" type="text" autoComplete="off" required maxLength={100} autoFocus />
      </label>
      <label className="f">
        Username <span className="xs muted">(optional: leave blank and one is suggested)</span>
        <input name="username" type="text" autoComplete="off" autoCapitalize="none" spellCheck={false} maxLength={30} />
      </label>
      {newRole === 'student' && (
        <>
          <label className="f">
            Guardian name <span className="xs muted">(only admins can see this)</span>
            <input name="guardianName" type="text" autoComplete="off" maxLength={100} />
          </label>
          <label className="f">
            Guardian phone
            <input name="guardianPhone" type="text" inputMode="tel" autoComplete="off" maxLength={30} />
          </label>
        </>
      )}
      {newRole === 'teacher' && (
        <label className="f">
          Phone
          <input name="phone" type="text" inputMode="tel" autoComplete="off" maxLength={30} />
        </label>
      )}
      <label className="f">
        Notes <span className="xs muted">(optional)</span>
        <textarea name="notes" rows={2} maxLength={1000} />
      </label>
      {created && !created.ok && (
        <p className="note bad" role="alert">
          {created.error}
        </p>
      )}
      <div className="row end">
        <button type="button" className="btn ghost" onClick={onCancel}>
          Cancel
        </button>
        <button type="submit" className="btn primary" disabled={creating}>
          {creating ? 'Creating…' : 'Create account'}
        </button>
      </div>
    </form>
  );
}

function LoginSlip({ slip, onDone }: { slip: Slip; onDone: () => void }) {
  return (
    <section className="stack" role="region" aria-label="Login slip">
      <h2 id="people-dialog-title">{slip.reason === 'created' ? `Account created for ${slip.name}` : `New password for ${slip.name}`}</h2>
      <p className="note warn">
        <strong>Shown once.</strong> Write it on the login slip now. Only a hash is stored, so nobody can see it again. You can reset it
        later.
      </p>
      <div className="slip">
        <b>CCKH Coding Club · lms.cckh.dev</b>
        <span>Name: {slip.name}</span>
        <span>
          Username: <span data-testid="slip-username">{slip.username}</span>
        </span>
        <span>
          Password: <span data-testid="slip-password">{slip.password}</span>
        </span>
      </div>
      <div className="row end">
        <button
          type="button"
          className="btn"
          onClick={() => navigator.clipboard?.writeText(`${slip.username} / ${slip.password}`).catch(() => undefined)}
        >
          Copy username and password
        </button>
        <button type="button" className="btn primary" onClick={onDone}>
          Done
        </button>
      </div>
    </section>
  );
}
