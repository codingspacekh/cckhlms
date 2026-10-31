'use client';
// Courses → Languages (M18a, BR-32, prototype screen 1): the languages a course can be taught in, how students hand in
// work in each, and how many courses use it. Admin adds one (Scratch, Roblox …) in a dialog: a project file of these
// types, a link to these sites, or either. The built-in ones can't be changed.
import { useRouter } from 'next/navigation';
import { useActionState, useRef, useState, useTransition } from 'react';
import { Icon } from '@/components/ui/Icon';
import { Pill } from '@/components/ui/Pill';
import { TableScroll } from '@/components/ui/TableScroll';
import { deleteLanguageAction, saveLanguageAction } from '@/modules/academics/language-actions';
import type { LanguageSummary } from '@/modules/academics/languages';
import type { FormResult } from '@/server/action-result';

const RUNS: Record<string, string> = { python: 'Run', java: 'Run', web: 'Preview' };

function HandIn({ l }: { l: LanguageSummary }) {
  if (l.handIn === 'code') return <Pill tone="info">Code in the editor · {RUNS[l.id] ?? 'Run'}</Pill>;
  return (
    <span className="row">
      {l.byFile && <Pill tone="good">File · {l.fileTypes.join(', ')}</Pill>}
      {l.byLink && (
        <Pill>
          {l.byFile ? 'or link' : 'Link'}
          {l.linkSites.length ? ` · ${l.linkSites.join(', ')}` : ''}
        </Pill>
      )}
    </span>
  );
}

export function LanguagesManager({ languages }: { languages: LanguageSummary[] }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [editing, setEditing] = useState<LanguageSummary | null>(null);
  const [formKey, setFormKey] = useState(0); // a fresh form each time the dialog opens
  const [status, setStatus] = useState<string | null>(null);
  const open = (l: LanguageSummary | null) => {
    setEditing(l);
    setFormKey((k) => k + 1);
    setStatus(null);
    dialog.current?.showModal();
  };
  const done = (message: string) => {
    setStatus(message);
    dialog.current?.close();
  };
  return (
    <section className="card flush" aria-labelledby="languages-title">
      <div className="chead">
        <div>
          <h2 id="languages-title">Languages</h2>
          <p className="xs muted">What a course is taught in, and how its students hand in work.</p>
        </div>
        <button type="button" className="btn primary" onClick={() => open(null)}>
          <Icon name="plus" /> Add language
        </button>
      </div>
      {status && (
        <p className="note m16" role="status">
          {status}
        </p>
      )}
      <TableScroll label="Languages table">
        <table aria-label="Languages">
          <thead>
            <tr>
              <th scope="col">Language</th>
              <th scope="col">Students hand in</th>
              <th scope="col">Courses</th>
              <th scope="col">
                <span className="sr-only">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {languages.map((l) => (
              <tr key={l.id}>
                <td className="strong">{l.name}</td>
                <td>
                  <HandIn l={l} />
                </td>
                <td className="tnum">{l.courses}</td>
                <td>
                  {l.builtIn ? (
                    <span className="xs muted">Comes with the LMS</span>
                  ) : (
                    <button type="button" className="btn sm" aria-label={`Edit ${l.name}`} onClick={() => open(l)}>
                      Edit
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </TableScroll>
      <dialog ref={dialog} className="dialog" aria-labelledby="language-form-title">
        {formKey > 0 && <LanguageForm key={formKey} language={editing} onDone={done} onCancel={() => dialog.current?.close()} />}
      </dialog>
    </section>
  );
}

function LanguageForm({
  language: l,
  onDone,
  onCancel,
}: {
  language: LanguageSummary | null;
  onDone: (message: string) => void;
  onCancel: () => void;
}) {
  const router = useRouter();
  const [byFile, setByFile] = useState(l ? l.byFile : true);
  const [byLink, setByLink] = useState(l ? l.byLink : false);
  const [deleting, startDelete] = useTransition();
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [result, formAction, saving] = useActionState(async (prev: FormResult | null, form: FormData) => {
    const r = await saveLanguageAction(prev, form);
    if (r.ok) onDone(r.message ?? 'Saved.');
    return r;
  }, null);
  const title = l ? `Edit ${l.name}` : 'Add a language';
  const remove = () =>
    startDelete(async () => {
      const r = await deleteLanguageAction(l!.id);
      if (!r.ok) return setDeleteError(r.error);
      onDone(r.message ?? 'Deleted.');
      router.refresh();
    });
  return (
    <form className="stack" action={formAction} aria-label={title}>
      <h2 id="language-form-title">{title}</h2>
      {l && <input type="hidden" name="id" value={l.id} />}
      <label className="f">
        Name
        <input name="name" type="text" defaultValue={l?.name} placeholder="Scratch" required maxLength={40} />
      </label>
      <fieldset className="stack fs">
        <legend className="f">Students hand in</legend>
        <label className="check">
          <input type="checkbox" name="byFile" checked={byFile} onChange={(e) => setByFile(e.target.checked)} /> A project file
          <span className="xs muted">· kept in the LMS, up to 20 MB</span>
        </label>
        {byFile && (
          <label className="f">
            <span>
              File types <span className="xs muted">(separated by commas)</span>
            </span>
            <input name="fileTypes" type="text" defaultValue={l?.fileTypes.join(', ')} placeholder=".sb3" required />
          </label>
        )}
        <label className="check">
          <input type="checkbox" name="byLink" checked={byLink} onChange={(e) => setByLink(e.target.checked)} /> A link to their project
          <span className="xs muted">· https only</span>
        </label>
        {byLink && (
          <label className="f">
            <span>
              From these sites <span className="xs muted">(leave empty for any)</span>
            </span>
            <input name="linkSites" type="text" defaultValue={l?.linkSites.join(', ')} placeholder="scratch.mit.edu" />
          </label>
        )}
      </fieldset>
      <p className="xs muted">No code editor, preview or Run: the teacher downloads the file or opens the link to mark it.</p>
      {result && !result.ok && (
        <p className="note bad" role="alert">
          {result.error}
        </p>
      )}
      {deleteError && (
        <p className="note bad" role="alert">
          {deleteError}
        </p>
      )}
      <div className="row end">
        {l && (
          <button type="button" className="btn ghost" aria-label={`Delete ${l.name}`} onClick={remove} disabled={deleting}>
            {deleting ? 'Deleting…' : 'Delete'}
          </button>
        )}
        <button type="button" className="btn ghost" onClick={onCancel}>
          Cancel
        </button>
        <button type="submit" className="btn primary" disabled={saving}>
          {saving ? 'Saving…' : l ? 'Save language' : 'Add language'}
        </button>
      </div>
    </form>
  );
}
