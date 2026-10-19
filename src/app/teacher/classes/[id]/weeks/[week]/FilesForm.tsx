'use client';
import { useRouter } from 'next/navigation';
import { useRef, useState, useTransition, type FormEvent } from 'react';
import { formatSize } from '@/modules/teaching/attachment-rules';
import { removeAttachmentAction } from '@/modules/teaching/lesson-actions';
import type { AttachmentRow } from '@/modules/teaching/attachments';

type Props = { classId: string; sessionId: string; lessonSaved: boolean; attachments: AttachmentRow[] };
type Message = { ok: boolean; text: string };

// Files for the lesson (FR-TCH-01): PDFs, images, code, zips. Images can also be shown in the note.
export function FilesForm({ classId, sessionId, lessonSaved, attachments }: Props) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [message, setMessage] = useState<Message | null>(null);
  const [pending, startTransition] = useTransition();

  function upload(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const files = [...(input.current?.files ?? [])];
    if (!files.length) return setMessage({ ok: false, text: 'Choose a file to upload.' });
    startTransition(async () => {
      for (const file of files) {
        const body = new FormData();
        body.set('file', file);
        const res = await fetch(`/api/sessions/${sessionId}/attachments`, { method: 'POST', body });
        const r = (await res.json().catch(() => ({ ok: false, error: 'Upload failed. Try again.' }))) as { ok: boolean; error?: string };
        if (!r.ok) {
          setMessage({ ok: false, text: r.error ?? 'Upload failed. Try again.' });
          router.refresh();
          return;
        }
      }
      if (input.current) input.current.value = '';
      setMessage({ ok: true, text: files.length === 1 ? `${files[0]!.name} added.` : `${files.length} files added.` });
      router.refresh();
    });
  }

  function remove(a: AttachmentRow) {
    startTransition(async () => {
      const r = await removeAttachmentAction(classId, a.id);
      setMessage(r.ok ? { ok: true, text: `${a.filename} removed.` } : { ok: false, text: r.error });
    });
  }

  return (
    <section className="card stack" aria-labelledby="files-title">
      <h2 id="files-title">Files</h2>
      {attachments.length > 0 && (
        <ul className="plain list" aria-label="Lesson files">
          {attachments.map((a) => (
            <li key={a.id} className="spread">
              <span className="stack-sm">
                <a href={`/api/files/${a.id}`} target="_blank" rel="noopener">
                  {a.filename}
                </a>
                <span className="xs muted">
                  {formatSize(a.size)}
                  {a.image && (
                    <>
                      {' · show it in the note with '}
                      <code className="mono">{`![${a.filename}](/api/files/${a.id})`}</code>
                    </>
                  )}
                </span>
              </span>
              <button
                type="button"
                className="btn sm ghost"
                onClick={() => remove(a)}
                disabled={pending}
                aria-label={`Remove ${a.filename}`}
              >
                Remove
              </button>
            </li>
          ))}
        </ul>
      )}
      {lessonSaved ? (
        <form className="row" onSubmit={upload} aria-label="Upload files">
          <label className="f grow">
            Add files
            <input ref={input} type="file" name="file" multiple />
          </label>
          <button type="submit" className="btn" disabled={pending}>
            {pending ? 'Uploading…' : 'Upload'}
          </button>
        </form>
      ) : (
        <p className="small muted">Save the lesson first, then add files to it.</p>
      )}
      <p className="xs muted">Up to 10 files of 10 MB each: PDF, images, Office files, zip, or code and text files.</p>
      {message && (
        <p className={message.ok ? 'note' : 'note bad'} role={message.ok ? 'status' : 'alert'}>
          {message.text}
        </p>
      )}
    </section>
  );
}
