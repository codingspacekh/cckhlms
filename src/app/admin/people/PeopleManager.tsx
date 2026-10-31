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
import { formatDay } from '@/modules/academics/schedule';
import { eraseStudentAction } from '@/modules/privacy/actions';
import { Select } from '@/components/ui/Select';

// The accounts table takes the full width; adding a person, editing one (M10), archiving or deleting one (M16b) and
// the one-time login slip open in a dialog. Active and Archived accounts are listed apart (BR-31).
export function PeopleManager({
  people,
  role,
  show = 'active',
  selfId,
  tabs,
  clubName,
  site,
}: {
  people: Person[];
  role: Role;
  show?: 'active' | 'archived';
  selfId: string;
  tabs: ReactNode;
  clubName: string;
  site: string;
}) {
  const router = useRouter();
  const dialog = useRef<HTMLDialogElement>(null);
  const [view, setView] = useState<'add' | 'slip' | 'edit' | 'archive' | 'delete' | null>(null);
  const [editing, setEditing] = useState<Person | null>(null);
  const active = people.filter((p) => p.active);
  const archived = people.filter((p) => !p.active);
  const listed = show === 'active' ? active : archived;
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
  function openFor(v: 'archive' | 'delete', p: Person) {
    setEditing(p);
    setStatus(null);
    setFormKey((k) => k + 1);
    setView(v);
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
        <div className="list-bar">
          <nav className="seg" aria-label="Show">
            {(['active', 'archived'] as const).map((w) => (
              <Link key={w} href={`/admin/people?role=${role}&show=${w}`} aria-current={w === show ? 'page' : undefined}>
                {w === 'active' ? `Active (${active.length})` : `Archived (${archived.length})`}
              </Link>
            ))}
          </nav>
          <span className="xs muted">
            {show === 'active'
              ? 'Accounts that can sign in. Archived ones move to Archived.'
              : 'They can’t sign in and are in no class. Their history is kept.'}
          </span>
        </div>
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
                {show === 'active' && role === 'student' && <th scope="col">Guardian phone</th>}
                {show === 'active' && role !== 'admin' && <th scope="col">{role === 'student' ? 'Classes now' : 'Teaches now'}</th>}
                {show === 'archived' && <th scope="col">Status</th>}
                <th scope="col">
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {listed.length === 0 && (
                <tr>
                  <td colSpan={5} className="muted">
                    {show === 'archived' ? 'Nothing archived.' : 'No accounts yet. Add the first one with “Add a person”.'}
                  </td>
                </tr>
              )}
              {listed.map((p) => (
                <tr key={p.id}>
                  <td className="strong">{p.name}</td>
                  <td className="mono">{p.username || '—'}</td>
                  {show === 'active' && role === 'student' && <td>{p.guardianPhone ?? '—'}</td>}
                  {show === 'active' && role !== 'admin' && <td className="text small muted">{p.classes.join(', ') || '—'}</td>}
                  {show === 'archived' && (
                    <td>
                      {p.erased ? (
                        <Pill icon="x">Personal data deleted</Pill>
                      ) : (
                        <Pill icon="x">{p.archivedAt ? `Archived ${formatDay(p.archivedAt)}` : 'Archived'}</Pill>
                      )}
                    </td>
                  )}
                  <td>
                    <div className="row end nowrap">
                      {show === 'active' && (
                        <button type="button" className="btn sm" aria-label={`Edit ${p.name}`} onClick={() => openEdit(p)}>
                          Edit
                        </button>
                      )}
                      {role === 'student' && (
                        <Link className="btn sm" href={`/admin/students/${p.id}`} aria-label={`Report for ${p.name}`}>
                          Report
                        </Link>
                      )}
                      {show === 'active' && (
                        <button type="button" className="btn sm" disabled={pending} onClick={() => act(() => resetPasswordAction(p.id))}>
                          Reset password
                        </button>
                      )}
                      {show === 'active' && p.id !== selfId && (
                        <button type="button" className="btn sm ghost" onClick={() => openFor('archive', p)}>
                          Archive
                        </button>
                      )}
                      {show === 'archived' && !p.erased && (
                        <>
                          <button
                            type="button"
                            className="btn sm"
                            aria-label={`Restore ${p.name}`}
                            disabled={pending}
                            onClick={() => act(() => setActiveAction(p.id, true))}
                          >
                            Restore
                          </button>
                          <button
                            type="button"
                            className="btn sm ghost"
                            aria-label={`Delete ${p.name}`}
                            onClick={() => openFor('delete', p)}
                          >
                            Delete…
                          </button>
                        </>
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
        {view === 'archive' && editing && (
          <ArchiveDialog key={formKey} person={editing} onDone={edited} onCancel={() => dialog.current?.close()} />
        )}
        {view === 'delete' && editing && (
          <DeleteDialog key={formKey} person={editing} onDone={edited} onCancel={() => dialog.current?.close()} />
        )}
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
        <Select name="role" value={newRole} onChange={(e) => setNewRole(e.target.value as Role)}>
          <option value="student">Student</option>
          <option value="teacher">Teacher</option>
          <option value="admin">Admin</option>
        </Select>
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

// BR-31: archiving says what will happen first, naming the classes a student leaves.
function ArchiveDialog({ person: p, onDone, onCancel }: { person: Person; onDone: (r: ActionResult) => void; onCancel: () => void }) {
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const student = p.role.split(',').includes('student');
  const archive = () =>
    start(async () => {
      const r = await setActiveAction(p.id, false);
      if (r.ok) onDone(r);
      else setError(r.error);
    });
  return (
    <section className="stack" role="region" aria-labelledby="people-dialog-title">
      <h2 id="people-dialog-title">Archive {p.name}?</h2>
      <ul className="small">
        <li>They’re signed out and can’t sign in.</li>
        <li>They move from Active to Archived.</li>
        {student && p.classes.length > 0 && (
          <li>
            They leave the classes they’re still in, from today: <strong>{p.classes.join(', ')}</strong>.
          </li>
        )}
        {!student && p.classes.length > 0 && (
          <li>
            They still teach <strong>{p.classes.join(', ')}</strong>. Give those classes another teacher on the class page.
          </li>
        )}
        <li>Their marks, attendance, reports and certificates stay.</li>
      </ul>
      <p className="small muted">You can restore the account later. Restoring doesn’t put anyone back in a class.</p>
      {error && (
        <p className="note bad" role="alert">
          {error}
        </p>
      )}
      <div className="row end">
        <button type="button" className="btn ghost" onClick={onCancel}>
          Cancel
        </button>
        <button type="button" className="btn primary" disabled={pending} onClick={archive}>
          Archive {p.name}
        </button>
      </div>
    </section>
  );
}

// BR-23, NFR-07: an archived account is deleted for good only when nothing depends on it; a used student's personal
// data can be deleted instead (typing the username to confirm); a used teacher's or admin's account stays.
function DeleteDialog({ person: p, onDone, onCancel }: { person: Person; onDone: (r: ActionResult) => void; onCancel: () => void }) {
  const [typed, setTyped] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const run = (fn: () => Promise<ActionResult>) =>
    start(async () => {
      const r = await fn();
      if (r.ok) onDone(r);
      else setError(r.error);
    });
  const problem = error && (
    <p className="note bad" role="alert">
      {error}
    </p>
  );

  if (p.deletable)
    return (
      <section className="stack" role="region" aria-labelledby="people-dialog-title">
        <h2 id="people-dialog-title">Delete {p.name} for good?</h2>
        <p className="small">
          {p.name} was never in a class and has nothing in the LMS, so the account can be removed completely. This can’t be undone.
        </p>
        {problem}
        <div className="row end">
          <button type="button" className="btn ghost" onClick={onCancel}>
            Cancel
          </button>
          <button type="button" className="btn primary" disabled={pending} onClick={() => run(() => deleteAccountAction(p.id))}>
            Delete {p.name}
          </button>
        </div>
      </section>
    );

  if (!p.role.split(',').includes('student'))
    return (
      <section className="stack" role="region" aria-labelledby="people-dialog-title">
        <h2 id="people-dialog-title">{p.name}’s account stays</h2>
        <p className="small">
          {p.keptBecause}, so the account can’t be deleted: the club’s records must stay true. It stays archived, and can’t sign in.
        </p>
        <div className="row end">
          <button type="button" className="btn primary" onClick={onCancel}>
            Close
          </button>
        </div>
      </section>
    );

  return (
    <form
      method="post"
      className="stack"
      aria-labelledby="people-dialog-title"
      onSubmit={(e) => {
        e.preventDefault();
        run(() => eraseStudentAction(p.id, typed));
      }}
    >
      <h2 id="people-dialog-title">Delete {p.name}?</h2>
      <p className="note warn">{p.keptBecause}, so the account itself stays: their classes’ results must stay true.</p>
      <p className="small">
        You can delete their <strong>personal data</strong> instead: name, username, guardian contact, notes, and what they wrote (hand-ins,
        Q&amp;A posts, Playground projects). Their scores and attendance stay under “Deleted student”, and their certificates are revoked.{' '}
        <strong>This can’t be undone.</strong>
      </p>
      <label className="f">
        <span>
          Type <span className="mono">{p.username}</span> to confirm
        </span>
        <input
          name="confirm"
          type="text"
          autoComplete="off"
          autoCapitalize="none"
          spellCheck={false}
          value={typed}
          onChange={(e) => setTyped(e.target.value)}
        />
      </label>
      {problem}
      <div className="row end">
        <button type="button" className="btn ghost" onClick={onCancel}>
          Cancel
        </button>
        <button type="submit" className="btn primary" disabled={pending || typed.trim().toLowerCase() !== p.username.toLowerCase()}>
          Delete personal data
        </button>
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
