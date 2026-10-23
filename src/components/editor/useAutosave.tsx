'use client';
// Autosave for a project (FR-CODE-05), shared by a student's work and their Playground projects: typing is saved
// about a second after it stops, a whole-file change at once, and the last change before the tab is hidden. Leaving
// with a change not saved yet asks first. Pictures already saved are sent by name only (src/lib/project/save.ts).
import { useEffect, useRef, useState } from 'react';
import type { ProjectFile } from '@/lib/project/files';
import { forSaving, isShortened, type SentFile } from '@/lib/project/save';
import { toClubTime } from '@/modules/academics/schedule';
import type { FormResult } from '@/server/action-result';

type SaveState = { kind: 'idle' | 'saving' } | { kind: 'saved'; at: string } | { kind: 'error'; text: string };
type Save = (files: SentFile[]) => Promise<FormResult<{ savedAt: string }>>;

const AUTOSAVE_MS = 1000;

// `initial`: the files the page opened with, which the server has (a saved draft, or the starter files).
export function useAutosave(save: Save, savedAt: string | null, initial: ProjectFile[]) {
  const [state, setState] = useState<SaveState>(savedAt ? { kind: 'saved', at: savedAt } : { kind: 'idle' });
  const pending = useRef<ProjectFile[] | null>(null);
  const saved = useRef(initial);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inFlight = useRef<Promise<boolean> | null>(null);

  // Saves what's pending; resolves to false if a save failed. A save already running is waited for.
  async function flush(): Promise<boolean> {
    if (timer.current) clearTimeout(timer.current);
    if (inFlight.current && !(await inFlight.current)) return false;
    const files = pending.current;
    if (!files) return true;
    pending.current = null;
    setState({ kind: 'saving' });
    inFlight.current = (async () => {
      const sent = forSaving(files, saved.current);
      let r = await save(sent);
      if (!r.ok && isShortened(sent)) r = await save(files); // the server's copy changed (another tab): send it all
      if (r.ok) saved.current = files;
      setState(r.ok ? { kind: 'saved', at: r.data!.savedAt } : { kind: 'error', text: r.error });
      return r.ok;
    })();
    const ok = await inFlight.current;
    inFlight.current = null;
    return pending.current ? flush() : ok; // typed again while saving
  }

  function changed(files: ProjectFile[], now: boolean) {
    pending.current = files;
    if (timer.current) clearTimeout(timer.current);
    if (now) void flush();
    else timer.current = setTimeout(() => void flush(), AUTOSAVE_MS);
  }

  useEffect(() => {
    const onHide = () => {
      if (document.visibilityState === 'hidden' && pending.current) void flush();
    };
    const onLeave = (e: BeforeUnloadEvent) => {
      if (pending.current || inFlight.current) e.preventDefault();
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

  return { state, changed, flush };
}

export function SaveStatus({ state, timeZone }: { state: SaveState; timeZone: string }) {
  return (
    <span className="small muted" role={state.kind === 'error' ? 'alert' : 'status'} data-testid="save-state">
      {state.kind === 'saving'
        ? 'Saving…'
        : state.kind === 'saved'
          ? `Saved at ${toClubTime(new Date(state.at), timeZone).time}`
          : state.kind === 'error'
            ? `Not saved: ${state.text}`
            : 'Your work is saved as you type.'}
    </span>
  );
}
