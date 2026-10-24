'use client';
import { useEffect, useId, useRef, useState, useTransition, type FormEvent, type ReactNode } from 'react';
import { NoteEditor } from '@/components/teaching/note-editor/NoteEditor';
import { NoteHtml } from '@/components/teaching/NoteHtml';
import { Icon } from '@/components/ui/Icon';
import { Pill } from '@/components/ui/Pill';
import { fitImage } from '@/lib/project/shrink';
import { formatDate } from '@/modules/academics/schedule';
import { MAX_NOTE_PICTURE_BYTES } from '@/modules/teaching/attachment-rules';
import { previewMarkdownAction, saveLessonAction } from '@/modules/teaching/lesson-actions';
import type { LessonState } from '@/modules/teaching/rules';
import type { FormResult } from '@/server/action-result';

type Props = {
  classId: string;
  sessionId: string;
  syllabus: { id: string; title: string }[];
  lesson: { title: string; contentMd: string; state: LessonState; topicIds: string[] } | null;
  // Shown in club time: the saved schedule, or the end of the session as a suggestion.
  schedule: { date: string; time: string };
  timeZone: string;
  // The class's language, for new code blocks.
  defaultLanguage: string;
  // The lesson's files (FilesForm), shown in the side column.
  files?: ReactNode;
};

const STATE_PILL: Record<LessonState, { text: string; tone: 'neutral' | 'good' | 'info' }> = {
  draft: { text: 'Draft', tone: 'neutral' },
  scheduled: { text: 'Scheduled', tone: 'info' },
  published: { text: 'Published', tone: 'good' },
};
const AUTOSAVE_MS = 2000;

type Draft = { title: string; markdown: string; topics: string[] };
const same = (a: Draft, b: Draft) => a.title === b.title && a.markdown === b.markdown && a.topics.join() === b.topics.join();
type Autosave = { kind: 'idle' } | { kind: 'saving' } | { kind: 'saved'; at: string } | { kind: 'failed'; error: string };

// The lesson note page (FR-TCH-01/02, FR-TCH-22; M9 design approved 2026-10-24): the note on the left, written in
// the editor or seen as students will see it; publishing, syllabus topics and files on the right. Drafts save by
// themselves; a published or scheduled note changes only when the teacher presses Update.
export function LessonForm({ classId, sessionId, syllabus, lesson, schedule, timeZone, defaultLanguage, files }: Props) {
  const formId = useId();
  const form = useRef<HTMLFormElement>(null);
  const [draft, setDraft] = useState<Draft>({
    title: lesson?.title ?? '',
    markdown: lesson?.contentMd ?? '',
    topics: lesson?.topicIds ?? [],
  });
  const [saved, setSaved] = useState<Draft>(draft);
  const [view, setView] = useState<'write' | 'student'>('write');
  const [html, setHtml] = useState('');
  const [result, setResult] = useState<FormResult | null>(null);
  const [autosave, setAutosave] = useState<Autosave>({ kind: 'idle' });
  const [pending, startTransition] = useTransition();
  // Pictures belong to a saved lesson, so a new one is saved as a draft before its first picture.
  const exists = useRef(lesson !== null);
  const state = lesson?.state;
  const autosaves = !state || state === 'draft';
  const dirty = !same(draft, saved);
  useUnsavedGuard(dirty);

  // Drafts save themselves a moment after typing stops. A lesson needs a title, so it waits for one.
  useEffect(() => {
    if (!autosaves || !dirty || !draft.title.trim()) return;
    const timer = setTimeout(() => {
      const sending = draft;
      setAutosave({ kind: 'saving' });
      void send('draft', null, true).then((r) => {
        if (r.ok) {
          setSaved(sending);
          setAutosave({ kind: 'saved', at: new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) });
        } else setAutosave({ kind: 'failed', error: r.error });
      });
    }, AUTOSAVE_MS);
    return () => clearTimeout(timer);
  }, [draft, dirty, autosaves]);

  // auto: a draft saving itself, which keeps pictures the note doesn't show for now (the teacher may be moving one).
  async function send(intent: string, submitter?: HTMLElement | null, auto = false) {
    const data = new FormData(form.current!, submitter);
    if (!submitter) data.set('intent', intent);
    if (auto) data.set('auto', '1');
    const r = await saveLessonAction(null, data);
    if (r.ok) exists.current = true;
    return r;
  }

  // A picture for the note (BR-22): shrunk in the browser, then stored as one of the lesson's note pictures.
  async function addPicture(file: File): Promise<string> {
    if (!exists.current) {
      if (!draft.title.trim()) throw new Error('Add a title first, so the lesson can be saved with its pictures.');
      const sending = draft;
      const r = await send('draft', null, true);
      if (!r.ok) throw new Error(r.error);
      setSaved(sending);
    }
    const bytes = await fitImage(file.name, new Uint8Array(await file.arrayBuffer()), MAX_NOTE_PICTURE_BYTES);
    const body = new FormData();
    body.set('file', new File([bytes as BlobPart], file.name, { type: file.type }));
    body.set('inNote', '1');
    const res = await fetch(`/api/sessions/${sessionId}/attachments`, { method: 'POST', body });
    const r = (await res.json().catch(() => ({ ok: false }))) as { ok: boolean; error?: string; attachment?: { id: string } };
    if (!r.ok || !r.attachment) throw new Error(r.error ?? 'The picture couldn’t be added. Try again.');
    return r.attachment.id;
  }

  // Submitted by hand (not <form action>) so the note isn't cleared if saving fails.
  function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const submitter = (e.nativeEvent as SubmitEvent).submitter;
    const sending = draft;
    startTransition(async () => {
      const r = await send('', submitter);
      if (r.ok) setSaved(sending);
      setResult(r);
    });
  }

  function showStudentView() {
    setView('student');
    void previewMarkdownAction(draft.markdown).then(setHtml);
  }

  const intent = (value: 'draft' | 'publish' | 'schedule', label: string, kind = '') => (
    <button type="submit" form={formId} name="intent" value={value} className={`btn ${kind}`.trim()} disabled={pending}>
      {label}
    </button>
  );
  const topicTitles = syllabus.filter((t) => draft.topics.includes(t.id)).map((t) => t.title);

  return (
    <div className="note-page">
      <form id={formId} ref={form} method="post" className="card note-main" aria-label="Lesson note" onSubmit={submit} noValidate>
        <input type="hidden" name="classId" value={classId} />
        <input type="hidden" name="sessionId" value={sessionId} />
        <div className="note-views" role="group" aria-label="View">
          <button type="button" aria-pressed={view === 'write'} onClick={() => setView('write')}>
            <Icon name="pencil" />
            Write
          </button>
          <button type="button" aria-pressed={view === 'student'} onClick={showStudentView}>
            <Icon name="eye" />
            Student view
          </button>
        </div>
        <div className="note-write" hidden={view !== 'write'}>
          <label className="note-title">
            <span className="sr-only">Title</span>
            <input
              type="text"
              name="title"
              value={draft.title}
              placeholder="Lesson title"
              onChange={(e) => setDraft({ ...draft, title: e.target.value })}
              maxLength={120}
              required
            />
          </label>
          <NoteEditor
            initialMarkdown={lesson?.contentMd ?? ''}
            defaultLanguage={defaultLanguage}
            onChange={(markdown) => setDraft((d) => ({ ...d, markdown }))}
            onPicture={addPicture}
          />
        </div>
        {view === 'student' && (
          <section className="note-student" aria-label="Student view">
            <p className="note-student-banner">This is how students will see the note on their week page.</p>
            <h2 className="note-student-title">{draft.title || 'Untitled lesson'}</h2>
            {topicTitles.length > 0 && (
              <div className="row">
                {topicTitles.map((t) => (
                  <Pill key={t}>{t}</Pill>
                ))}
              </div>
            )}
            <NoteHtml html={html} />
          </section>
        )}
      </form>

      <div className="note-side">
        <section className="card stack" aria-labelledby="publish-title">
          <div className="spread">
            <h2 id="publish-title">Publish</h2>
            {state && (
              <Pill tone={STATE_PILL[state].tone} icon={state === 'published' ? 'check' : state === 'scheduled' ? 'clock' : undefined}>
                {STATE_PILL[state].text}
              </Pill>
            )}
          </div>
          <p className="small muted">
            {state === 'published'
              ? 'Students in this class can read it.'
              : state === 'scheduled'
                ? `Students will see it from ${formatDate(schedule.date)} at ${schedule.time}.`
                : 'Students can’t see a draft. Publish it now, or set a time.'}
          </p>
          <SaveState
            autosaves={autosaves}
            dirty={dirty}
            hasTitle={!!draft.title.trim()}
            autosave={autosave}
            state={state}
            isNew={!lesson}
          />
          {result && !result.ok && (
            <p className="note bad" role="alert">
              {result.error}
            </p>
          )}
          {result?.ok && (
            <p className="note" role="status">
              {result.message}
            </p>
          )}
          <div className="row">
            {state === 'published' ? (
              <>
                {intent('publish', 'Update', 'primary')}
                {intent('draft', 'Move back to draft', 'ghost')}
              </>
            ) : state === 'scheduled' ? (
              <>
                {intent('schedule', 'Update schedule', 'primary')}
                {intent('publish', 'Publish now')}
                {intent('draft', 'Move back to draft', 'ghost')}
              </>
            ) : (
              <>
                {intent('publish', 'Publish now', 'primary')}
                {intent('draft', 'Save draft')}
              </>
            )}
          </div>
          {state !== 'published' && (
            <details className="sched" open={state === 'scheduled'}>
              <summary>Schedule for later</summary>
              <div className="stack">
                <div className="grid g2">
                  <label className="f">
                    Publish on
                    <input type="date" name="publishDate" form={formId} defaultValue={schedule.date} />
                  </label>
                  <label className="f">
                    At
                    <input type="time" name="publishTime" form={formId} defaultValue={schedule.time} />
                  </label>
                </div>
                <p className="xs muted">Club time ({timeZone}). Students see the lesson from then on.</p>
                {state !== 'scheduled' && <div>{intent('schedule', 'Schedule')}</div>}
              </div>
            </details>
          )}
        </section>

        {syllabus.length > 0 && (
          <fieldset className="card stack note-topics">
            <legend>Syllabus topics</legend>
            <div className="chips">
              {syllabus.map((t) => (
                <label key={t.id} className="chip">
                  <input
                    type="checkbox"
                    name="topicIds"
                    value={t.id}
                    form={formId}
                    checked={draft.topics.includes(t.id)}
                    onChange={(e) =>
                      setDraft({
                        ...draft,
                        topics: syllabus.map((s) => s.id).filter((id) => (id === t.id ? e.target.checked : draft.topics.includes(id))),
                      })
                    }
                  />{' '}
                  {t.title}
                </label>
              ))}
            </div>
          </fieldset>
        )}
        {files}
      </div>
    </div>
  );
}

// One quiet line about saving. Autosave isn't announced: it would interrupt every few seconds.
function SaveState(p: { autosaves: boolean; dirty: boolean; hasTitle: boolean; autosave: Autosave; state?: LessonState; isNew: boolean }) {
  let text = '';
  if (!p.autosaves) {
    if (p.dirty) text = `Changes not saved. Press ${p.state === 'scheduled' ? 'Update schedule' : 'Update'} to show them to students.`;
  } else if (p.autosave.kind === 'saving') text = 'Saving…';
  else if (p.autosave.kind === 'failed') text = `Not saved: ${p.autosave.error}`;
  else if (p.dirty && !p.hasTitle) text = 'Add a title to save the draft';
  else if (p.autosave.kind === 'saved' && !p.dirty) text = `Draft saved at ${p.autosave.at}`;
  else if (p.isNew && !p.dirty) text = 'Not saved yet';
  if (!text) return null;
  return <p className={`xs ${p.autosave.kind === 'failed' || (!p.autosaves && p.dirty) ? 'warn-text' : 'muted'}`}>{text}</p>;
}

// Asks before leaving the page (closing, reloading or following a link) while there are changes that aren't saved.
function useUnsavedGuard(dirty: boolean) {
  useEffect(() => {
    if (!dirty) return;
    const unload = (e: BeforeUnloadEvent) => e.preventDefault();
    const click = (e: MouseEvent) => {
      const a = (e.target as Element | null)?.closest?.('a[href]');
      if (a && !a.closest('.note-main') && !confirm('Leave this page? Your changes to the lesson note aren’t saved.')) {
        e.preventDefault();
        e.stopPropagation();
      }
    };
    window.addEventListener('beforeunload', unload);
    document.addEventListener('click', click, true);
    return () => {
      window.removeEventListener('beforeunload', unload);
      document.removeEventListener('click', click, true);
    };
  }, [dirty]);
}
