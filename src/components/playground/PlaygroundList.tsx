'use client';
// FR-CODE-07: the student's Playground projects, a form to start one (up to the limit), and delete with a
// confirmation. Starting a project opens it.
import Link from 'next/link';
import { useActionState, useRef, useState, useTransition } from 'react';
import { TableScroll } from '@/components/ui/TableScroll';
import { WORK_LANGUAGE_LABEL } from '@/modules/assessments/rules';
import { createProjectAction, deleteProjectAction } from '@/modules/playground/actions';
import type { PlaygroundLanguage } from '@/modules/playground/playground';

export type PlaygroundRow = { id: string; name: string; language: PlaygroundLanguage; files: number; saved: string };
const LANGUAGES: PlaygroundLanguage[] = ['python', 'java', 'web'];

export function PlaygroundList({ projects, limit }: { projects: PlaygroundRow[]; limit: number }) {
  const [created, createAction, creating] = useActionState(createProjectAction, null);
  const [deleting, setDeleting] = useState<PlaygroundRow | null>(null);
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();
  const dialog = useRef<HTMLDialogElement>(null);
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
      <form className="card stack narrow-form" action={createAction} aria-label="New project">
        <h2>New project</h2>
        <div className="grid g2 start">
          <label className="f">
            Name
            <input name="name" type="text" required maxLength={60} placeholder="e.g. Guessing game" disabled={full} />
          </label>
          <label className="f">
            Language
            <select name="language" defaultValue="python" disabled={full}>
              {LANGUAGES.map((l) => (
                <option key={l} value={l}>
                  {WORK_LANGUAGE_LABEL[l]}
                </option>
              ))}
            </select>
          </label>
        </div>
        {created && !created.ok && (
          <p className="note bad" role="alert">
            {created.error}
          </p>
        )}
        {full && <p className="note">You have {projects.length} projects, the most you can keep. Delete one to start another.</p>}
        <div>
          <button type="submit" className="btn primary" disabled={full || creating}>
            Start project
          </button>
        </div>
      </form>

      {result && (
        <p className={`note ${result.ok ? '' : 'bad'}`} role={result.ok ? 'status' : 'alert'}>
          {result.text}
        </p>
      )}
      <section className="card flush" aria-labelledby="projects-title">
        <div className="chead">
          <h2 id="projects-title">My projects</h2>
          <span className="small muted">
            {projects.length} of {limit} projects.
          </span>
        </div>
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
                    No projects yet. Start one above: it’s yours to try things out, and nobody marks it.
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
