'use client';
// M18b · BR-32 · FR-STU-05/06 (prototype screen 4): handing in work in a language Admin added, such as Scratch or
// Roblox. The student drops or chooses their project file and/or pastes the link to their shared project, then
// presses Hand in; the upload goes to /api/work/<id>/hand-in. Below: what they handed in, each file to download and
// each link to open, with their mark and feedback above, as for code work.
import { useRouter } from 'next/navigation';
import { useId, useRef, useState, type DragEvent } from 'react';
import { MarkCards } from '@/components/assessments/MarkCards';
import type { SubmitPanel } from '@/components/editor/StudentWorkspace';
import { Icon } from '@/components/ui/Icon';
import { Pill } from '@/components/ui/Pill';
import { MAX_PROJECT_FILE_BYTES } from '@/modules/academics/language-rules';
import type { HandedInFile } from '@/modules/assessments/submissions';

type Language = { name: string; byFile: boolean; fileTypes: string[]; byLink: boolean; linkSites: string[] };
type Props = {
  assessmentId: string;
  language: Language;
  submit: Omit<SubmitPanel, 'versions'> & {
    versions: (SubmitPanel['versions'][number] & { file: HandedInFile | null; link: string | null })[];
  };
};

const sizeLabel = (bytes: number) =>
  bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;
const shortLink = (url: string) => url.replace(/^https:\/\/(www\.)?/, '').replace(/\/$/, '');
const extOf = (name: string) => (name.includes('.') ? name.slice(name.lastIndexOf('.')).toLowerCase() : '');

export function HandInBox({ assessmentId, language: l, submit }: Props) {
  const router = useRouter();
  const ids = useId();
  const input = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [link, setLink] = useState('');
  const [over, setOver] = useState(false);
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null);
  const latest = submit.versions[0];
  const types = l.fileTypes.join(' or ');

  function pick(f: File | undefined) {
    setResult(null);
    if (!f) return;
    if (!l.fileTypes.includes(extOf(f.name))) return setResult({ ok: false, text: `Hand in a ${types} file.` });
    if (f.size > MAX_PROJECT_FILE_BYTES) return setResult({ ok: false, text: `${f.name} is bigger than 20 MB.` });
    setFile(f);
  }
  function drop(e: DragEvent) {
    e.preventDefault();
    setOver(false);
    pick(e.dataTransfer.files[0]);
  }

  async function handIn() {
    const what = [l.byFile && `your ${types} file`, l.byLink && 'paste your project link'].filter(Boolean).join(' or ');
    if (!file && !link.trim()) return setResult({ ok: false, text: `Choose ${what}.` });
    setResult(null);
    setSending(true);
    const body = new FormData();
    if (file) body.set('file', file);
    if (link.trim()) body.set('link', link.trim());
    try {
      const res = await fetch(`/api/work/${assessmentId}/hand-in`, { method: 'POST', body });
      const r = (await res.json()) as { ok: boolean; error?: string; version?: number; late?: boolean };
      if (!r.ok) return setResult({ ok: false, text: r.error ?? 'That couldn’t be handed in. Try again.' });
      setResult({ ok: true, text: `Handed in (version ${r.version}). Your teacher can see it now.` });
      setFile(null);
      setLink('');
      router.refresh();
    } catch {
      setResult({ ok: false, text: 'That couldn’t be handed in: check the connection and try again.' });
    } finally {
      setSending(false);
    }
  }

  return (
    <>
      <MarkCards
        latest={latest}
        mark={submit.mark}
        maxScore={submit.maxScore}
        latePenaltyPct={submit.latePenaltyPct}
        redo="Change your project and hand it in again."
      />
      <section className="card stack" aria-labelledby="hand-in-title">
        <div>
          <h2 id="hand-in-title">Hand in your project</h2>
          <p className="small muted" data-testid="submit-state">
            {!latest
              ? `Not handed in yet. Due ${submit.dueLabel}.`
              : submit.mark === 'returned'
                ? `Version ${latest.version} returned for a redo.`
                : latest.byTeacher
                  ? 'Your teacher entered a mark without a hand-in.'
                  : `Version ${latest.version} handed in ${latest.at}${latest.late ? ', late' : ''}.${submit.canSubmit && !submit.late ? ` You can hand it in again until ${submit.dueLabel}.` : ''}`}
          </p>
        </div>
        {!submit.canSubmit && submit.reason && <p className="note">{submit.reason}</p>}
        {submit.canSubmit && (
          <>
            {l.byFile &&
              (file ? (
                <div className="file-box">
                  <span className="file-icon" aria-hidden="true">
                    {extOf(file.name).slice(1)}
                  </span>
                  <span className="grow">
                    <strong>{file.name}</strong>
                    <br />
                    <span className="xs muted">{sizeLabel(file.size)}</span>
                  </span>
                  <button type="button" className="btn ghost sm" aria-label={`Remove ${file.name}`} onClick={() => setFile(null)}>
                    Remove
                  </button>
                </div>
              ) : (
                <div
                  className={`drop-zone${over ? ' over' : ''}`}
                  onDragOver={(e) => {
                    e.preventDefault();
                    setOver(true);
                  }}
                  onDragLeave={() => setOver(false)}
                  onDrop={drop}
                >
                  <Icon name="upload" />
                  <label htmlFor={`${ids}-file`} className="strong">
                    Your {l.name} file
                  </label>
                  <span className="xs muted">
                    Drop your {types} file here, or{' '}
                    <button type="button" className="link" onClick={() => input.current?.click()}>
                      choose it
                    </button>
                    . Up to 20 MB.
                  </span>
                  <input
                    ref={input}
                    id={`${ids}-file`}
                    type="file"
                    className="sr-only"
                    accept={l.fileTypes.join(',')}
                    onChange={(e) => {
                      pick(e.target.files?.[0]);
                      e.target.value = '';
                    }}
                  />
                </div>
              ))}
            {l.byFile && l.byLink && <p className="or-line xs muted">or</p>}
            {l.byLink && (
              <label className="f">
                Link to your shared project
                <input
                  type="url"
                  value={link}
                  onChange={(e) => setLink(e.target.value)}
                  placeholder={l.linkSites.length ? `https://${l.linkSites[0]}/…` : 'https://…'}
                  maxLength={500}
                />
              </label>
            )}
            {submit.late && (
              <p className="note warn">
                The due time has passed, so this will be marked late
                {submit.latePenaltyPct > 0 ? ` and ${submit.latePenaltyPct}% comes off the score` : ''}.
              </p>
            )}
            <div className="row end">
              <button type="button" className="btn primary" disabled={sending} onClick={handIn}>
                {sending ? 'Handing in…' : 'Hand in'}
              </button>
            </div>
          </>
        )}
        {result && (
          <p className={`note ${result.ok ? '' : 'bad'}`} role={result.ok ? 'status' : 'alert'}>
            {result.text}
          </p>
        )}
        {submit.versions.length > 0 && (
          <ul className="plain list" aria-label="Versions you handed in">
            {submit.versions.map((v) => (
              <li key={v.version} className="spread small">
                <span className="cell-line">
                  {v.byTeacher ? 'Mark from your teacher' : `Version ${v.version}`}
                  {v.file && (
                    <a href={v.file.href} download>
                      {v.file.name}
                    </a>
                  )}
                  {v.link && (
                    <a href={v.link} target="_blank" rel="noopener noreferrer">
                      {shortLink(v.link)}
                    </a>
                  )}
                </span>
                <span className="cell-line tnum">
                  {v.at}
                  {v.late && <Pill tone="warn">Late</Pill>}
                  {v.returned ? (
                    <Pill icon="alert">Returned</Pill>
                  ) : (
                    v.score !== null && <strong>{`${v.score} / ${submit.maxScore}`}</strong>
                  )}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}
