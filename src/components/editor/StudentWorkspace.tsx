'use client';
import { useEffect, useRef, useState } from 'react';
import type { ProjectFile } from '@/lib/project/files';
import { toClubTime } from '@/modules/academics/schedule';
import { saveDraftAction } from '@/modules/assessments/project-actions';
import { ProjectEditor } from './ProjectEditor';

type Props = {
  assessmentId: string;
  initial: ProjectFile[];
  savedAt: string | null;
  nonce: string;
  java: boolean;
  zipName: string;
  timeZone: string;
};
type SaveState = { kind: 'idle' | 'saving' } | { kind: 'saved'; at: string } | { kind: 'error'; text: string };

const AUTOSAVE_MS = 1000;

// FR-CODE-05: the student's project, saved about a second after they stop typing.
export function StudentWorkspace({ assessmentId, initial, savedAt, nonce, java, zipName, timeZone }: Props) {
  const [state, setState] = useState<SaveState>(savedAt ? { kind: 'saved', at: savedAt } : { kind: 'idle' });
  const pending = useRef<ProjectFile[] | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const saving = useRef(false);

  async function flush() {
    if (saving.current || !pending.current) return;
    const files = pending.current;
    pending.current = null;
    saving.current = true;
    setState({ kind: 'saving' });
    const r = await saveDraftAction(assessmentId, files);
    saving.current = false;
    if (r.ok) setState({ kind: 'saved', at: r.data!.savedAt });
    else setState({ kind: 'error', text: r.error });
    if (pending.current) void flush(); // typed again while saving
  }

  function changed(files: ProjectFile[], now: boolean) {
    pending.current = files;
    if (timer.current) clearTimeout(timer.current);
    if (now) void flush();
    else timer.current = setTimeout(() => void flush(), AUTOSAVE_MS);
  }

  // Leaving with unsaved changes: save at once when the tab is hidden, and ask before the page unloads.
  useEffect(() => {
    const unsaved = () => !!pending.current || saving.current;
    const onHide = () => {
      if (document.visibilityState === 'hidden' && pending.current) void flush();
    };
    const onLeave = (e: BeforeUnloadEvent) => {
      if (unsaved()) e.preventDefault();
    };
    document.addEventListener('visibilitychange', onHide);
    window.addEventListener('beforeunload', onLeave);
    return () => {
      if (timer.current) clearTimeout(timer.current);
      document.removeEventListener('visibilitychange', onHide);
      window.removeEventListener('beforeunload', onLeave);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- flush reads refs only
  }, []);

  return (
    <section className="stack" aria-labelledby="project-title">
      <div className="spread">
        <h2 id="project-title">Your project</h2>
        <span className="small muted" role={state.kind === 'error' ? 'alert' : 'status'} data-testid="save-state">
          {state.kind === 'saving'
            ? 'Saving…'
            : state.kind === 'saved'
              ? `Saved at ${toClubTime(new Date(state.at), timeZone).time}`
              : state.kind === 'error'
                ? `Not saved: ${state.text}`
                : 'Your work is saved as you type.'}
        </span>
      </div>
      <ProjectEditor initial={initial} nonce={nonce} java={java} zipName={zipName} onChange={changed} />
    </section>
  );
}
