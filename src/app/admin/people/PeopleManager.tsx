'use client';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useActionState, useRef, useState, useTransition, type ReactNode } from 'react';
import { SlipCard } from '@/components/accounts/SlipSheet';
import { Icon } from '@/components/ui/Icon';
import { PageHeader } from '@/components/ui/PageHeader';
import { Pill } from '@/components/ui/Pill';
import { TableScroll } from '@/components/ui/TableScroll';
import {
  createAccountAction,
  deleteAccountAction,
  resetPasswordAction,
  setActiveAction,
  signOutEverywhereAction,
  updateAccountAction,
  type ActionResult,
  type Slip,
} from '@/modules/identity/actions';
import type { Person, Role } from '@/modules/identity/service';

// The accounts table takes the full width; adding a person, editing one (M10) and the one-time login slip open in a
// dialog.
export function PeopleManager({
  people,
  role,
  selfId,
  tabs,
  clubName,
  site,
}: {
  people: Person[];
  role: Role;
  selfId: string;
  tabs: ReactNode;
  clubName: string;
  site: string;
}) {
  const router = useRouter();
  const dialog = useRef<HTMLDialogElement>(null);
  const [view, setView] = useState<'add' | 'slip' | 'edit' | null>(null);
  const [editing, setEditing] = useState<Person | null>(null);
  const [formKey, setFormKey] = useState(0); // a fresh form each time the dialog opens
  const [slip, setSlip] = useState<Slip | null>(null);
  const [status, setStatus] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, startTransition] = useTransition();

  function openAdd() {
    setFormKey((k) => k + 1);
    setView('add');
    dialog.current?.showModal();
  }
  function openEdit(p: Person) {
    setEditing(p);
    setStatus(null);
    setFormKey((k) => k + 1);
    setView('edit');
    dialog.current?.showModal();
  }
  function edited(r: ActionResult) {
    dialog.current?.close();
    if (r.ok && r.message) setStatus({ ok: true, text: r.message });
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
          <>
            <Link className="btn" href="/admin/people/import">
              <Icon name="upload" /> Import students
            </Link>
            <button type="button" className="btn primary" onClick={openAdd}>
              <Icon name="plus" /> Add a person
            </button>
          </>
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
                    {p.erased ? (
                      <Pill icon="x">Personal data deleted</Pill>
                    ) : p.active ? (
                      <Pill tone="good" icon="check">
                        Active
                      </Pill>
                    ) : (
                      <Pill icon="x">Switched off</Pill>
                    )}
                  </td>
                  <td>
                    <div className="row end nowrap">
                      {!p.erased && (
                        <button type="button" className="btn sm" aria-label={`Edit ${p.name}`} onClick={() => openEdit(p)}>
                          Edit
                        </button>
                      )}
                      {role === 'student' && (
                        <Link className="btn sm" href={`/admin/students/${p.id}`} aria-label={`Report for ${p.name}`}>
                          Report
                        </Link>
                      )}
                      {!p.erased && (
                        <button type="button" className="btn sm" disabled={pending} onClick={() => act(() => resetPasswordAction(p.id))}>
                          Reset password
                        </button>
                      )}
                      {p.id !== selfId && !p.erased && (
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
        {view === 'slip' && slip && <LoginSlip slip={slip} clubName={clubName} site={site} onDone={() => dialog.current?.close()} />}
        {view === 'edit' && editing && (
          <EditPersonForm key={formKey} person={editing} role={role} onDone={edited} onCancel={() => dialog.current?.close()} />
        )}
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

// The role can't change here: an account made with the wrong role is deleted (when unused) and added again.
function EditPersonForm({
  person: p,
  role,
  onDone,
  onCancel,
}: {
  person: Person;
  role: Role;
  onDone: (r: ActionResult) => void;
  onCancel: () => void;
}) {
  const [saved, formAction, saving] = useActionState(async (prev: ActionResult | null, form: FormData) => {
    const r = await updateAccountAction(prev, form);
    if (r.ok) onDone(r);
    return r;
  }, null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [deleting, startDelete] = useTransition();
  const run = (fn: () => Promise<ActionResult>) =>
    startDelete(async () => {
      const r = await fn();
      if (r.ok) onDone(r);
      else setDeleteError(r.error);
    });
  const problem = deleteError ?? (saved && !saved.ok ? saved.error : null);

  return (
    <form className="stack" action={formAction} aria-label={`Edit ${p.name}`}>
      <h2 id="people-dialog-title">Edit {p.name}</h2>
      <input type="hidden" name="userId" value={p.id} />
      <label className="f">
        Full name
        <input name="name" type="text" defaultValue={p.name} autoComplete="off" required maxLength={100} />
      </label>
      <label className="f">
        Username <span className="xs muted">(they sign in with the new one straight away)</span>
        <input
          name="username"
          type="text"
          defaultValue={p.username}
          autoComplete="off"
          autoCapitalize="none"
          spellCheck={false}
          required
          maxLength={30}
        />
      </label>
      {role === 'student' && (
        <>
          <label className="f">
            Guardian name <span className="xs muted">(only admins can see this)</span>
            <input name="guardianName" type="text" defaultValue={p.guardianName ?? ''} autoComplete="off" maxLength={100} />
          </label>
          <label className="f">
            Guardian phone
            <input
              name="guardianPhone"
              type="text"
              inputMode="tel"
              defaultValue={p.guardianPhone ?? ''}
              autoComplete="off"
              maxLength={30}
            />
          </label>
        </>
      )}
      {role === 'teacher' && (
        <label className="f">
          Phone
          <input name="phone" type="text" inputMode="tel" defaultValue={p.phone ?? ''} autoComplete="off" maxLength={30} />
        </label>
      )}
      {role !== 'admin' && (
        <label className="f">
          Notes <span className="xs muted">(optional)</span>
          <textarea name="notes" rows={2} defaultValue={p.notes ?? ''} maxLength={1000} />
        </label>
      )}
      <p className="small muted">
        Signed in on a shared or lost device?{' '}
        <button type="button" className="btn sm ghost" disabled={deleting} onClick={() => run(() => signOutEverywhereAction(p.id))}>
          Sign out everywhere
        </button>
      </p>
      {problem && (
        <p className="note bad" role="alert">
          {problem}
        </p>
      )}
      <div className="spread">
        <div className="row">
          {confirmDelete ? (
            <button type="button" className="btn sm" disabled={deleting} onClick={() => run(() => deleteAccountAction(p.id))}>
              Yes, delete {p.name}
            </button>
          ) : (
            <button type="button" className="btn sm ghost" onClick={() => setConfirmDelete(true)}>
              Delete account
            </button>
          )}
        </div>
        <div className="row end">
          <button type="button" className="btn ghost" onClick={onCancel}>
            Cancel
          </button>
          <button type="submit" className="btn primary" disabled={saving}>
            {saving ? 'Saving…' : 'Save details'}
          </button>
        </div>
      </div>
    </form>
  );
}

function LoginSlip({ slip, clubName, site, onDone }: { slip: Slip; clubName: string; site: string; onDone: () => void }) {
  return (
    <section className="stack" role="region" aria-label="Login slip">
      <h2 id="people-dialog-title">{slip.reason === 'created' ? `Account created for ${slip.name}` : `New password for ${slip.name}`}</h2>
      <p className="note warn">
        <strong>Shown once.</strong> Write it on the login slip now. Only a hash is stored, so nobody can see it again. You can reset it
        later.
      </p>
      <SlipCard slip={slip} clubName={clubName} site={site} />
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
