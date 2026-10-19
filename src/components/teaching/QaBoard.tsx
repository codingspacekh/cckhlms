'use client';
import { useRef, useState, useTransition, type FormEvent, type ReactNode } from 'react';
import { Pill } from '@/components/ui/Pill';
import { formatDate, formatDayMonth, toClubTime } from '@/modules/academics/schedule';
import { acceptReplyAction, askQuestionAction, moderatePostAction, replyAction, reportPostAction } from '@/modules/teaching/qa-actions';
import type { PostRef, QuestionView, ReplyView } from '@/modules/teaching/qa';
import type { FormResult } from '@/server/action-result';

type Props = {
  classId: string;
  week: number;
  role: 'student' | 'teacher';
  open: boolean;
  questions: QuestionView[];
  timeZone: string;
};

// Q&A under a lesson (FR-STU-03/04/10, FR-TCH-03). Bodies are rendered by the server's sanitiser.
export function QaBoard({ classId, week, role, open, questions, timeZone }: Props) {
  const [result, setResult] = useState<FormResult | null>(null);
  const [reporting, setReporting] = useState<(PostRef & { author: string }) | null>(null);
  const [pending, startTransition] = useTransition();
  const dialog = useRef<HTMLDialogElement>(null);
  const teacher = role === 'teacher';

  const run = (action: () => Promise<FormResult>, onOk?: () => void) =>
    startTransition(async () => {
      const r = await action();
      setResult(r);
      if (r.ok) onOk?.();
    });

  function ask(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const f = new FormData(form);
    run(
      () => askQuestionAction(classId, week, String(f.get('body') ?? ''), String(f.get('code') ?? '')),
      () => form.reset(),
    );
  }

  function answer(e: FormEvent<HTMLFormElement>, questionId: string) {
    e.preventDefault();
    const form = e.currentTarget;
    run(
      () => replyAction(classId, questionId, String(new FormData(form).get('body') ?? '')),
      () => form.reset(),
    );
  }

  function openReport(ref: PostRef, author: string) {
    setReporting({ ...ref, author });
    setResult(null);
    dialog.current?.showModal();
  }

  function report(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!reporting) return;
    const ref: PostRef = { type: reporting.type, id: reporting.id };
    const reason = String(new FormData(e.currentTarget).get('reason') ?? '');
    run(
      () => reportPostAction(classId, ref, reason),
      () => dialog.current?.close(),
    );
  }

  // Short in the post header ('30 Jan, 10:15') so it fits on one line; the full date shows on hover.
  const when = (d: Date) => {
    const t = toClubTime(new Date(d), timeZone);
    return (
      <time dateTime={new Date(d).toISOString()} title={`${formatDate(t.date)}, ${t.time}`}>
        {formatDayMonth(t.date)}, {t.time}
      </time>
    );
  };

  // Report / restore / remove, depending on who is looking and the post's state.
  function postActions(ref: PostRef, p: ReplyView): ReactNode {
    if (teacher) {
      return (
        <>
          {p.state !== 'visible' && (
            <button
              type="button"
              className="btn sm"
              disabled={pending}
              onClick={() => run(() => moderatePostAction(classId, ref, 'restore'))}
            >
              Restore
            </button>
          )}
          {p.state !== 'hidden' && (
            <button
              type="button"
              className="btn sm ghost"
              disabled={pending}
              onClick={() => run(() => moderatePostAction(classId, ref, 'remove'))}
            >
              Remove
            </button>
          )}
        </>
      );
    }
    if (!p.mine && p.state === 'visible')
      return (
        <button
          type="button"
          className="btn sm ghost"
          onClick={() => openReport(ref, p.author)}
          aria-label={`Report ${ref.type} from ${p.author}`}
        >
          Report
        </button>
      );
    return null;
  }

  function header(ref: PostRef, p: ReplyView, extra?: ReactNode) {
    return (
      <div className="spread qa-head">
        <span className="small">
          <strong>{p.author}</strong>
          {p.byTeacher && ' · teacher'} <span className="muted">· {when(p.createdAt)}</span>
        </span>
        <span className="row">
          {p.state === 'under_review' && (
            <Pill tone="warn" icon="alert">
              Under review
            </Pill>
          )}
          {p.state === 'hidden' && <Pill icon="x">Removed</Pill>}
          {extra}
          {postActions(ref, p)}
        </span>
      </div>
    );
  }

  const reportsNote = (p: ReplyView) =>
    teacher &&
    p.reports.length > 0 && (
      <p className="note warn small">Reported by {p.reports.map((r) => (r.reason ? `${r.by} (“${r.reason}”)` : r.by)).join(', ')}</p>
    );

  return (
    <section className="stack" aria-labelledby="qa-title">
      <h2 id="qa-title">Questions</h2>
      {!open && <p className="card small muted">Questions open once the lesson is published.</p>}
      {open && !teacher && (
        <form className="card stack" aria-label="Ask a question" onSubmit={ask}>
          <label className="f">
            Your question
            <textarea name="body" rows={3} maxLength={4000} placeholder="What are you stuck on?" required />
          </label>
          <label className="f">
            Code (optional)
            <textarea name="code" rows={3} maxLength={4000} className="mono" spellCheck={false} />
          </label>
          <div>
            <button type="submit" className="btn primary" disabled={pending}>
              Post question
            </button>
          </div>
        </form>
      )}
      {result && !result.ok && !reporting && (
        <p className="note bad" role="alert">
          {result.error}
        </p>
      )}
      <p className="sr-only" role="status">
        {result?.ok ? result.message : ''}
      </p>
      {open && questions.length === 0 && <p className="small muted">No questions yet.</p>}
      {questions.length > 0 && (
        <ul className="plain stack" aria-label="Questions">
          {questions.map((q) => (
            <li key={q.id}>
              <article className={`q ${q.state === 'visible' ? '' : 'review'}`} aria-label={`Question from ${q.author}`}>
                {header({ type: 'question', id: q.id }, q)}
                {reportsNote(q)}
                <div className="md" dangerouslySetInnerHTML={{ __html: q.bodyHtml }} />
                {q.code && (
                  <pre className="code">
                    <code>{q.code}</code>
                  </pre>
                )}
                {q.replies.length > 0 && (
                  <ul className="plain stack-sm" aria-label={`Replies to ${q.author}`}>
                    {q.replies.map((r) => {
                      const accepted = q.acceptedReplyId === r.id;
                      return (
                        <li key={r.id} className={`reply ${accepted ? 'accepted' : ''}`} aria-label={`Reply from ${r.author}`}>
                          {header(
                            { type: 'reply', id: r.id },
                            r,
                            <>
                              {accepted && (
                                <Pill tone="good" icon="check">
                                  Answer
                                </Pill>
                              )}
                              {teacher && r.state === 'visible' && q.state === 'visible' && (
                                <button
                                  type="button"
                                  className="btn sm ghost"
                                  disabled={pending}
                                  onClick={() => run(() => acceptReplyAction(classId, q.id, accepted ? null : r.id))}
                                >
                                  {accepted ? 'Unmark answer' : 'Mark as answer'}
                                </button>
                              )}
                            </>,
                          )}
                          {reportsNote(r)}
                          <div className="md small" dangerouslySetInnerHTML={{ __html: r.bodyHtml }} />
                        </li>
                      );
                    })}
                  </ul>
                )}
                {q.state === 'visible' && (
                  <form className="row" onSubmit={(e) => answer(e, q.id)} aria-label={`Reply to ${q.author}`}>
                    <input
                      type="text"
                      name="body"
                      maxLength={4000}
                      required
                      aria-label={`Your reply to ${q.author}`}
                      placeholder={teacher ? 'Answer as teacher…' : 'Help with an answer…'}
                      className="grow"
                    />
                    <button type="submit" className="btn sm" disabled={pending}>
                      Reply
                    </button>
                  </form>
                )}
              </article>
            </li>
          ))}
        </ul>
      )}
      <dialog ref={dialog} className="dialog" aria-labelledby="report-title" onClose={() => setReporting(null)}>
        {reporting && (
          <form className="stack" onSubmit={report}>
            <h2 id="report-title">Report this {reporting.type}</h2>
            <p className="small muted">
              It will be hidden from other students until a teacher checks it. {reporting.author} won&apos;t see who reported it.
            </p>
            <label className="f">
              Reason (optional)
              <input type="text" name="reason" maxLength={200} autoFocus />
            </label>
            {result && !result.ok && (
              <p className="note bad" role="alert">
                {result.error}
              </p>
            )}
            <div className="row">
              <button type="submit" className="btn primary" disabled={pending}>
                Report
              </button>
              <button type="button" className="btn ghost" onClick={() => dialog.current?.close()}>
                Cancel
              </button>
            </div>
          </form>
        )}
      </dialog>
    </section>
  );
}
