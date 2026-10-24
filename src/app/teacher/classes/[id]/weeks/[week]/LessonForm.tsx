'use client';
import { useEffect, useRef, useState, useTransition, type FormEvent } from 'react';
import { NoteHtml } from '@/components/teaching/NoteHtml';
import { Pill } from '@/components/ui/Pill';
import { formatDate } from '@/modules/academics/schedule';
import type { FormResult } from '@/server/action-result';
import { previewMarkdownAction, saveLessonAction } from '@/modules/teaching/lesson-actions';
import type { LessonState } from '@/modules/teaching/rules';

type Props = {
  classId: string;
  sessionId: string;
  syllabus: { id: string; title: string }[];
  lesson: { title: string; contentMd: string; state: LessonState; topicIds: string[] } | null;
  // Shown in club time: the saved schedule, or the end of the session as a suggestion.
  schedule: { date: string; time: string };
  timeZone: string;
  initialHtml: string;
};

const STATE_PILL: Record<LessonState, { text: string; tone: 'neutral' | 'good' | 'info' }> = {
  draft: { text: 'Draft', tone: 'neutral' },
  scheduled: { text: 'Scheduled', tone: 'info' },
  published: { text: 'Published', tone: 'good' },
};

export function LessonForm({ classId, sessionId, syllabus, lesson, schedule, timeZone, initialHtml }: Props) {
  const [title, setTitle] = useState(lesson?.title ?? '');
  const [source, setSource] = useState(lesson?.contentMd ?? '');
  const [html, setHtml] = useState(initialHtml);
  const [result, setResult] = useState<FormResult | null>(null);
  const [pending, startTransition] = useTransition();
  const latest = useRef(0);
  const first = useRef(true);

  // Live preview, rendered by the server's sanitiser a moment after typing stops.
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    const n = ++latest.current;
    const timer = setTimeout(() => {
      void previewMarkdownAction(source).then((h) => {
        if (n === latest.current) setHtml(h);
      });
    }, 300);
    return () => clearTimeout(timer);
  }, [source]);

  // Submitted by hand (not <form action>) so the note isn't cleared if saving fails.
  function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const data = new FormData(e.currentTarget, (e.nativeEvent as SubmitEvent).submitter);
    startTransition(async () => setResult(await saveLessonAction(null, data)));
  }

  const state = lesson?.state;
  const intent = (value: 'draft' | 'publish' | 'schedule', label: string, kind = '') => (
    <button type="submit" name="intent" value={value} className={`btn ${kind}`.trim()} disabled={pending}>
      {label}
    </button>
  );

  return (
    <div className="grid g2 start">
      <form method="post" className="card stack" aria-label="Lesson note" onSubmit={submit} noValidate>
        <input type="hidden" name="classId" value={classId} />
        <input type="hidden" name="sessionId" value={sessionId} />
        <label className="f">
          Title
          <input type="text" name="title" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={120} required />
        </label>
        <div className="stack-sm">
          <label className="f">
            Lesson note
            <textarea
              name="contentMd"
              className="mono"
              rows={16}
              value={source}
              onChange={(e) => setSource(e.target.value)}
              aria-describedby="md-help"
            />
          </label>
          <span id="md-help" className="xs muted">
            Markdown: **bold**, - lists, ## headings, and ``` for code blocks.
          </span>
        </div>
        {syllabus.length > 0 && (
          <fieldset className="f">
            <legend>Syllabus topics covered</legend>
            <div className="chips">
              {syllabus.map((t) => (
                <label key={t.id} className="chip">
                  <input type="checkbox" name="topicIds" value={t.id} defaultChecked={lesson?.topicIds.includes(t.id)} /> {t.title}
                </label>
              ))}
            </div>
          </fieldset>
        )}
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
          {state && (
            <Pill tone={STATE_PILL[state].tone} icon={state === 'published' ? 'check' : state === 'scheduled' ? 'clock' : undefined}>
              {STATE_PILL[state].text}
            </Pill>
          )}
        </div>
        {state !== 'published' && (
          <details className="sched" open={state === 'scheduled'}>
            <summary>Schedule for later</summary>
            <div className="stack">
              <div className="grid g2">
                <label className="f">
                  Publish on
                  <input type="date" name="publishDate" defaultValue={schedule.date} />
                </label>
                <label className="f">
                  At
                  <input type="time" name="publishTime" defaultValue={schedule.time} />
                </label>
              </div>
              <p className="xs muted">
                Club time ({timeZone}). Students see the lesson from then on
                {state === 'scheduled' ? `: ${formatDate(schedule.date)} at ${schedule.time}` : ''}.
              </p>
              {state !== 'scheduled' && <div>{intent('schedule', 'Schedule')}</div>}
            </div>
          </details>
        )}
      </form>
      <section className="card" aria-label="Preview">
        <p className="xs muted">Preview</p>
        <h2>{title || 'Untitled lesson'}</h2>
        <NoteHtml html={html} />
      </section>
    </div>
  );
}
