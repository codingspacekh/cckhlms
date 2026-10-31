'use client';
// FR-CODE-07: the student's Playground projects, "New project" (up to the limit) in a dialog (owner, 2026-10-31), and
// delete with a confirmation. Starting a project opens it.
import Link from 'next/link';
import { useActionState, useRef, useState, useTransition } from 'react';
import { TableScroll } from '@/components/ui/TableScroll';
import { WORK_LANGUAGE_LABEL } from '@/modules/assessments/rules';
import { createProjectAction, deleteProjectAction } from '@/modules/playground/actions';
import type { PlaygroundLanguage } from '@/modules/playground/playground';
import { Select } from '@/components/ui/Select';

export type PlaygroundRow = { id: string; name: string; language: PlaygroundLanguage; files: number; saved: string };
const LANGUAGES: PlaygroundLanguage[] = ['python', 'java', 'web'];

export function PlaygroundList({ projects, limit }: { projects: PlaygroundRow[]; limit: number }) {
  const [deleting, setDeleting] = useState<PlaygroundRow | null>(null);
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();
  const dialog = useRef<HTMLDialogElement>(null);
  const newDialog = useRef<HTMLDialogElement>(null);
  const [formKey, setFormKey] = useState(0); // a fresh form each time it opens
  const full = projects.length >= limit;

  function ask(p: PlaygroundRow) {
    setResult(null);
    setDeleting(p);
    dialog.current?.showModal();
  }
  function remove() {
    if (!deleting) return;
    start(async () => {
      const r = await deleteProjectAction(deleting.id);
      dialog.current?.close();
      setResult(r.ok ? { ok: true, text: r.message ?? 'Deleted.' } : { ok: false, text: r.error });
    });
  }

  return (
    <>
      {result && (
        <p className={`note ${result.ok ? '' : 'bad'}`} role={result.ok ? 'status' : 'alert'}>
          {result.text}
        </p>
      )}
      <section className="card flush" aria-labelledby="projects-title">
        <div className="chead">
          <div>
            <h2 id="projects-title">My projects</h2>
            <span className="small muted">
              {projects.length} of {limit} projects.
            </span>
          </div>
          <button
            type="button"
            className="btn primary"
            disabled={full}
            onClick={() => {
              setFormKey((k) => k + 1);
              newDialog.current?.showModal();
            }}
          >
            New project
          </button>
        </div>
        {full && <p className="note m16">You have {projects.length} projects, the most you can keep. Delete one to start another.</p>}
        <TableScroll label="My projects table">
          <table aria-label="My projects">
            <thead>
              <tr>
                <th scope="col">Project</th>
                <th scope="col">Language</th>
                <th scope="col" className="n">
                  Files
                </th>
                <th scope="col">Last saved</th>
                <th scope="col">
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {projects.length === 0 && (
                <tr>
                  <td colSpan={5} className="muted">
                    No projects yet. Start one with New project: it’s yours to try things out, and nobody marks it.
                  </td>
                </tr>
              )}
              {projects.map((p) => (
                <tr key={p.id}>
                  <td>
                    <Link className="strong" href={`/student/playground/${p.id}`}>
                      {p.name}
                    </Link>
                  </td>
                  <td>{WORK_LANGUAGE_LABEL[p.language]}</td>
                  <td className="n tnum">{p.files}</td>
                  <td className="tnum">{p.saved}</td>
                  <td className="n">
                    <button type="button" className="btn sm ghost" aria-label={`Delete ${p.name}`} onClick={() => ask(p)}>
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </TableScroll>
      </section>

      <dialog ref={newDialog} className="dialog" aria-label="New project">
        {formKey > 0 && <NewProjectForm key={formKey} onCancel={() => newDialog.current?.close()} />}
      </dialog>
      <dialog ref={dialog} className="dialog" aria-labelledby="delete-project-title">
        <div className="stack">
          <h2 id="delete-project-title">Delete {deleting?.name}?</h2>
          <p className="small">Its files are deleted too. Download a .zip first if you want to keep them.</p>
          <div className="row">
            <button type="button" className="btn primary" disabled={pending} onClick={remove}>
              Delete project
            </button>
            <button type="button" className="btn ghost" onClick={() => dialog.current?.close()}>
              Cancel
            </button>
          </div>
        </div>
      </dialog>
    </>
  );
}

// Starting a project opens it (the action redirects there), so the dialog only stays open to show a problem.
function NewProjectForm({ onCancel }: { onCancel: () => void }) {
  const [created, createAction, creating] = useActionState(createProjectAction, null);
  return (
    <form className="stack" action={createAction} aria-label="New project">
      <h2>New project</h2>
      <label className="f">
        Name
        <input name="name" type="text" required maxLength={60} placeholder="e.g. Guessing game" autoFocus />
      </label>
      <label className="f">
        Language
        <Select name="language" defaultValue="python">
          {LANGUAGES.map((l) => (
            <option key={l} value={l}>
              {WORK_LANGUAGE_LABEL[l]}
            </option>
          ))}
        </Select>
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
          Start project
        </button>
      </div>
    </form>
  );
}
