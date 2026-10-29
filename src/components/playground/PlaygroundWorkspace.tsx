'use client';
// FR-CODE-07: one Playground project: the editor, saved as the student types (FR-CODE-05), the live page preview
// for Web projects (FR-CODE-04), and renaming.
import { useState, useTransition } from 'react';
import { ProjectEditor } from '@/components/editor/ProjectEditor';
import { SaveStatus, useAutosave } from '@/components/editor/useAutosave';
import type { ProjectFile } from '@/lib/project/files';
import { renameProjectAction, saveProjectAction } from '@/modules/playground/actions';

type Props = {
  id: string;
  name: string;
  initial: ProjectFile[];
  savedAt: string | null;
  nonce: string;
  java: boolean;
  previewOrigin?: string;
  run?: 'python' | 'java'; // the Run panel (M11)
  zipName: string;
  timeZone: string;
};

export function PlaygroundWorkspace({ id, name, initial, savedAt, nonce, java, previewOrigin, run, zipName, timeZone }: Props) {
  const { state, changed } = useAutosave((files) => saveProjectAction(id, files), savedAt, initial);
  const [newName, setNewName] = useState(name);
  const [renamed, setRenamed] = useState<{ ok: boolean; text: string } | null>(null);
  const [renaming, start] = useTransition();

  function rename(e: React.FormEvent) {
    e.preventDefault();
    setRenamed(null);
    start(async () => {
      const r = await renameProjectAction(id, newName);
      setRenamed(r.ok ? { ok: true, text: r.message ?? 'Renamed.' } : { ok: false, text: r.error });
    });
  }

  return (
    <>
      <section className="stack" aria-labelledby="project-title">
        <div className="spread">
          <h2 id="project-title">Project files</h2>
          <SaveStatus state={state} timeZone={timeZone} />
        </div>
        <ProjectEditor
          initial={initial}
          nonce={nonce}
          java={java}
          previewOrigin={previewOrigin}
          run={run}
          zipName={zipName}
          onChange={changed}
        />
      </section>
      <form method="post" className="card stack narrow-form" aria-labelledby="rename-title" onSubmit={rename}>
        <h2 id="rename-title">Rename project</h2>
        <label className="f">
          Name
          <input type="text" value={newName} onChange={(e) => setNewName(e.target.value)} required maxLength={60} />
        </label>
        {renamed && (
          <p className={`note ${renamed.ok ? '' : 'bad'}`} role={renamed.ok ? 'status' : 'alert'}>
            {renamed.text}
          </p>
        )}
        <div>
          <button type="submit" className="btn" disabled={renaming || newName.trim() === ''}>
            Rename
          </button>
        </div>
      </form>
    </>
  );
}
