'use client';
import { useRouter } from 'next/navigation';
import { useState, useTransition, type ChangeEvent } from 'react';
import { SlipSheet, type SlipData } from '@/components/accounts/SlipSheet';
import { TableScroll } from '@/components/ui/TableScroll';
import { checkImportAction, importStudentsAction } from '@/modules/identity/actions';
import type { ImportTarget } from '@/modules/identity/batches';
import { IMPORT_TEMPLATE, type ImportCheck } from '@/modules/identity/import-rules';

const MAX_BYTES = 500_000;
const TEMPLATE_HREF = `data:text/csv;charset=utf-8,${encodeURIComponent(IMPORT_TEMPLATE)}`;
const readText = (file: File) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsText(file, 'utf-8');
  });
const accounts = (n: number) => `${n} ${n === 1 ? 'account' : 'accounts'}`;

function placesLabel(t: ImportTarget) {
  if (t.placesLeft == null) return t.name;
  if (t.placesLeft === 0) return `${t.name} (full)`;
  return `${t.name} (${t.placesLeft} ${t.placesLeft === 1 ? 'place' : 'places'} left)`;
}

// FR-AUTH-08: choosing a file checks it on the server (nothing is written); with no errors, one click creates every
// account (and enrolment) at once, and the login slips are shown to print.
export function ImportStudents({ targets, clubName, site }: { targets: ImportTarget[]; clubName: string; site: string }) {
  const router = useRouter();
  const [text, setText] = useState<string | null>(null);
  const [check, setCheck] = useState<ImportCheck | null>(null);
  const [classId, setClassId] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<{ slips: SlipData[]; enrolled: string | null } | null>(null);
  const [pending, start] = useTransition();
  const terms = [...new Set(targets.map((t) => t.termName))];

  function choose(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ''; // so choosing the same file again, once fixed, checks it again
    setCheck(null);
    setText(null);
    setError(null);
    if (!file) return;
    if (file.size > MAX_BYTES) {
      setError('That file is too big. Import at most 300 students at a time.');
      return;
    }
    start(async () => {
      const content = await readText(file);
      const r = await checkImportAction(content);
      if (!r.ok) setError(r.error);
      else {
        setText(content);
        setCheck(r.data ?? null);
      }
    });
  }
  function create() {
    if (text == null) return;
    setError(null);
    start(async () => {
      const r = await importStudentsAction(text, classId);
      if (!r.ok) setError(r.error);
      else if (r.data) setDone(r.data);
    });
  }

  if (done)
    return (
      <SlipSheet
        title={`${accounts(done.slips.length)} created${done.enrolled ? ` and enrolled in ${done.enrolled}` : ''}`}
        clubName={clubName}
        site={site}
        className={done.enrolled ?? undefined}
        slips={done.slips}
        onDone={() => router.push('/admin/people?role=student')}
      />
    );

  const ready = check && check.errors.length === 0 && check.rows.length > 0;
  return (
    <>
      <section className="card stack narrow-form" aria-label="The file">
        <p className="small">
          A CSV file whose first line names the columns: <strong>name</strong> (needed), and if you like <strong>username</strong>,{' '}
          <strong>guardian name</strong>, <strong>guardian phone</strong> and <strong>notes</strong>. Leave a username blank and one is
          suggested. In Excel or Google Sheets, save or download it as “CSV UTF-8” so names in Khmer keep their letters.
        </p>
        <div className="row">
          <a className="btn sm" href={TEMPLATE_HREF} download="students.csv">
            Download the template
          </a>
        </div>
        <label className="f">
          CSV file
          <input type="file" accept=".csv,text/csv" onChange={choose} disabled={pending} />
        </label>
        <label className="f">
          Enrol them in
          <select value={classId} onChange={(e) => setClassId(e.target.value)}>
            <option value="">Don’t enrol them yet</option>
            {terms.map((term) => (
              <optgroup key={term} label={term}>
                {targets
                  .filter((t) => t.termName === term)
                  .map((t) => (
                    <option key={t.id} value={t.id} disabled={t.placesLeft === 0}>
                      {placesLabel(t)}
                    </option>
                  ))}
              </optgroup>
            ))}
          </select>
        </label>
        {pending && !check && <p className="small muted">Checking the file…</p>}
      </section>

      {error && (
        <p className="note bad" role="alert">
          {error}
        </p>
      )}

      {check && check.errors.length > 0 && (
        <div className="note bad" role="alert">
          <p>
            <strong>Fix these lines in the file, then choose it again.</strong> Nothing is imported until every line is right.
          </p>
          <ul>
            {check.errors.map((e) => (
              <li key={e}>{e}</li>
            ))}
          </ul>
        </div>
      )}

      {ready && (
        <>
          {check.warnings.length > 0 && (
            <div className="note warn" role="note">
              <p>
                <strong>Please check.</strong> These won’t stop the import:
              </p>
              <ul>
                {check.warnings.map((w) => (
                  <li key={w}>{w}</li>
                ))}
              </ul>
            </div>
          )}
          <section className="card flush" aria-label="Preview">
            <TableScroll label="Students in the file, scrollable">
              <table aria-label="Students in the file">
                <thead>
                  <tr>
                    <th scope="col" className="n">
                      Line
                    </th>
                    <th scope="col">Name</th>
                    <th scope="col">Username</th>
                    <th scope="col">Guardian</th>
                    <th scope="col">Guardian phone</th>
                  </tr>
                </thead>
                <tbody>
                  {check.rows.map((r) => (
                    <tr key={r.line}>
                      <td className="n tnum muted">{r.line}</td>
                      <th scope="row" className="strong">
                        {r.name}
                      </th>
                      <td>
                        <span className="mono">{r.username}</span>
                        {r.suggested && <span className="sub xs muted">suggested</span>}
                      </td>
                      <td>{r.guardianName ?? '—'}</td>
                      <td>{r.guardianPhone ?? '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </TableScroll>
          </section>
          <div className="row">
            <button type="button" className="btn primary" disabled={pending} onClick={create}>
              {pending ? 'Creating…' : `Create ${accounts(check.rows.length)}`}
            </button>
          </div>
        </>
      )}
    </>
  );
}
