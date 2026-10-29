'use client';
import { useEffect, useRef, useState, useTransition } from 'react';
import type { ProjectFile } from '@/lib/project/files';
import { saveStarterAction } from '@/modules/assessments/project-actions';
import { ProjectEditor } from './ProjectEditor';

type Props = {
  classId: string;
  assessmentId: string;
  initial: ProjectFile[];
  nonce: string;
  java: boolean;
  previewOrigin?: string;
  run?: 'python' | 'java'; // the Run panel (M11)
  zipName: string;
};

// FR-CODE-06: the teacher's starter files, copied into each student's project when they first open the work.
export function StarterEditor({ classId, assessmentId, initial, nonce, java, previewOrigin, run, zipName }: Props) {
  const files = useRef(initial);
  const [dirty, setDirty] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, startTransition] = useTransition();
  // Ask before leaving with starter files that aren't saved yet.
  useEffect(() => {
    if (!dirty) return;
    const onLeave = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener('beforeunload', onLeave);
    return () => window.removeEventListener('beforeunload', onLeave);
  }, [dirty]);
  return (
    <section className="stack" aria-labelledby="starter-title">
      <div className="spread">
        <div>
          <h2 id="starter-title">Starter files</h2>
          <p className="small muted">Each student starts with a copy of these. Changes reach students who haven’t opened the work yet.</p>
        </div>
        <div className="row nowrap">
          {result && (
            <span className={`small ${result.ok ? 'muted' : 'bad-text'}`} role={result.ok ? 'status' : 'alert'}>
              {result.text}
            </span>
          )}
          <button
            type="button"
            className="btn primary"
            disabled={pending || !dirty}
            onClick={() =>
              startTransition(async () => {
                const r = await saveStarterAction(classId, assessmentId, files.current);
                setResult(r.ok ? { ok: true, text: 'Saved.' } : { ok: false, text: r.error });
                if (r.ok) setDirty(false);
              })
            }
          >
            Save starter files
          </button>
        </div>
      </div>
      <ProjectEditor
        initial={initial}
        nonce={nonce}
        java={java}
        previewOrigin={previewOrigin}
        run={run}
        zipName={zipName}
        onChange={(next: ProjectFile[]) => {
          files.current = next;
          setDirty(true);
          setResult(null);
        }}
      />
    </section>
  );
}
