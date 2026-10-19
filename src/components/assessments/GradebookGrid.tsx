'use client';
// FR-TCH-19: the gradebook grid. Every cell is a text box: type a score, "ex" to excuse, or nothing to clear.
// Tab moves across a row, Enter / Shift+Enter move down / up a column, like a spreadsheet. A cell saves by
// itself when you leave it changed, and the student's overall score updates from the server's answer.
import Link from 'next/link';
import { useRef, useState, type KeyboardEvent } from 'react';
import { Pill } from '@/components/ui/Pill';
import { TableScroll } from '@/components/ui/TableScroll';
import type { GradebookCell, Overall } from '@/modules/assessments/gradebook';
import { saveCellAction, saveCommentAction } from '@/modules/assessments/gradebook-actions';
import { CELL_LABEL, KIND_LABEL, type Kind, type WorkLanguage } from '@/modules/assessments/rules';

type Work = { id: string; title: string; kind: Kind; language: WorkLanguage; maxScore: number; week: number | null; dueLabel: string };
type Row = { id: string; name: string; cells: Record<string, GradebookCell>; overall: Overall };
type Props = { classId: string; passMark: number; work: Work[]; rows: Row[] };
type CellUi = { cell: GradebookCell; text: string; saved: string; error: boolean; saving: boolean };

const textOf = (c: GradebookCell) => (c.state === 'excused' ? 'ex' : c.score === null ? '' : String(c.score));
const keyOf = (studentId: string, workId: string) => `${studentId}:${workId}`;

export function GradebookGrid({ classId, passMark, work, rows }: Props) {
  const [cells, setCells] = useState(() => {
    const m = new Map<string, CellUi>();
    for (const r of rows)
      for (const w of work) {
        const cell = r.cells[w.id]!;
        m.set(keyOf(r.id, w.id), { cell, text: textOf(cell), saved: textOf(cell), error: false, saving: false });
      }
    return m;
  });
  const [overall, setOverall] = useState(() => new Map(rows.map((r) => [r.id, r.overall])));
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [selected, setSelected] = useState<{ studentId: string; workId: string } | null>(null);
  const [comment, setComment] = useState('');
  const latest = useRef(cells); // the cells as of the last event, for handlers that run before a re-render
  const inputs = useRef(new Map<string, HTMLInputElement>());

  const name = (studentId: string) => rows.find((r) => r.id === studentId)!.name;
  const title = (workId: string) => work.find((w) => w.id === workId)!.title;
  const label = (studentId: string, workId: string) => `${name(studentId)}, ${title(workId)}`;

  function patch(key: string, change: (c: CellUi) => CellUi) {
    const next = new Map(latest.current);
    next.set(key, change(next.get(key)!));
    latest.current = next;
    setCells(next);
  }

  async function commit(studentId: string, workId: string) {
    const key = keyOf(studentId, workId);
    const c = latest.current.get(key)!;
    const text = c.text.trim();
    if (c.saving || text === c.saved) return;
    patch(key, (x) => ({ ...x, saving: true }));
    const r = await saveCellAction(classId, workId, studentId, text, c.cell.version);
    if (r.ok && r.data) {
      const { cell, overall: o } = r.data;
      patch(key, (x) => ({
        cell,
        // Keep anything typed while it was saving; that's saved when the cell is left again.
        text: x.text.trim() === text ? textOf(cell) : x.text,
        saved: textOf(cell),
        error: false,
        saving: false,
      }));
      setOverall((m) => new Map(m).set(studentId, o));
      setMessage({ ok: true, text: `Saved: ${label(studentId, workId)}.` });
    } else {
      patch(key, (x) => ({ ...x, error: true, saving: false }));
      setMessage({ ok: false, text: `${label(studentId, workId)}: ${r.ok ? 'not saved.' : r.error}` });
    }
  }

  function move(rowIndex: number, workId: string, by: number) {
    const target = rows[rowIndex + by];
    if (target) inputs.current.get(keyOf(target.id, workId))?.focus();
  }

  function onKeyDown(e: KeyboardEvent<HTMLInputElement>, rowIndex: number, studentId: string, workId: string) {
    const by = e.key === 'Enter' ? (e.shiftKey ? -1 : 1) : e.key === 'ArrowDown' ? 1 : e.key === 'ArrowUp' ? -1 : 0;
    if (!by) return;
    e.preventDefault();
    void commit(studentId, workId);
    move(rowIndex, workId, by);
  }

  function select(studentId: string, workId: string) {
    setSelected({ studentId, workId });
    setComment(latest.current.get(keyOf(studentId, workId))!.cell.comment);
  }

  async function saveComment() {
    if (!selected) return;
    const key = keyOf(selected.studentId, selected.workId);
    const c = latest.current.get(key)!;
    const r = await saveCommentAction(classId, selected.workId, selected.studentId, comment, c.cell.version);
    if (r.ok) patch(key, (x) => ({ ...x, cell: { ...x.cell, comment: comment.trim() } }));
    setMessage(
      r.ok
        ? { ok: true, text: `Comment saved: ${label(selected.studentId, selected.workId)}.` }
        : { ok: false, text: `${label(selected.studentId, selected.workId)}: ${r.error}` },
    );
  }

  if (!work.length) return <p className="card small muted">No published work yet. Work you set in a week appears here as a column.</p>;

  const sel = selected ? cells.get(keyOf(selected.studentId, selected.workId))! : null;
  const canComment = !!sel && sel.cell.version !== null;
  return (
    <section className="stack" aria-labelledby="gradebook-title">
      <div>
        <h2 id="gradebook-title">Scores</h2>
        <p className="small muted">Type a score, or ex to excuse. Tab moves right, Enter moves down. Each cell saves by itself.</p>
      </div>
      <p className="sr-only" role="status">
        {message?.ok ? message.text : ''}
      </p>
      {message && !message.ok && (
        <p className="note bad" role="alert">
          {message.text}
        </p>
      )}
      <div className="card flush">
        <TableScroll label="Gradebook table">
          <table className="gradebook" aria-label="Gradebook">
            <thead>
              <tr>
                <th scope="col" className="sticky-col">
                  Student
                </th>
                {work.map((w) => (
                  <th key={w.id} scope="col">
                    {w.language === 'paper' ? w.title : <Link href={`/teacher/classes/${classId}/work/${w.id}`}>{w.title}</Link>}
                    <span className="sub">
                      {w.week ? `Wk ${w.week} · ` : ''}
                      {KIND_LABEL[w.kind]} · /{w.maxScore}
                    </span>
                  </th>
                ))}
                <th scope="col" className="n">
                  Overall
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => {
                const o = overall.get(r.id)!.overall;
                return (
                  <tr key={r.id}>
                    <th scope="row" className="sticky-col">
                      {r.name}
                    </th>
                    {work.map((w) => {
                      const key = keyOf(r.id, w.id);
                      const c = cells.get(key)!;
                      const state = c.cell.state;
                      const showState = state !== 'graded' && state !== 'not_due'; // a score speaks for itself
                      const showLate = c.cell.late && state !== 'excused';
                      return (
                        <td key={w.id} className={`gcell ${state}`}>
                          <input
                            type="text"
                            inputMode="decimal"
                            autoComplete="off"
                            aria-label={`${r.name}, ${w.title} (out of ${w.maxScore})`}
                            aria-invalid={c.error ? true : undefined}
                            ref={(el) => {
                              if (el) inputs.current.set(key, el);
                              else inputs.current.delete(key);
                            }}
                            value={c.text}
                            onChange={(e) => patch(key, (x) => ({ ...x, text: e.target.value }))}
                            onFocus={(e) => {
                              e.currentTarget.select();
                              select(r.id, w.id);
                            }}
                            onBlur={() => void commit(r.id, w.id)}
                            onKeyDown={(e) => onKeyDown(e, i, r.id, w.id)}
                          />
                          {(showState || showLate) && (
                            <span className="gstate">
                              {showState && CELL_LABEL[state]}
                              {showLate && <span className="late">Late</span>}
                            </span>
                          )}
                        </td>
                      );
                    })}
                    <td className="n tnum" data-testid={`overall-${r.id}`}>
                      {o === null ? (
                        '—'
                      ) : (
                        <span className="cell-line">
                          {o.toFixed(1)}
                          {o < passMark && <Pill tone="warn">Below {passMark}</Pill>}
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </TableScroll>
      </div>
      <div className="card stack" aria-labelledby="comment-title">
        <h3 id="comment-title">Comment on a cell</h3>
        <p className="small muted" data-testid="comment-for">
          {!selected
            ? 'Choose a cell to comment on it. The student sees the comment with their mark.'
            : canComment
              ? `${label(selected.studentId, selected.workId)}.`
              : `${label(selected.studentId, selected.workId)}: enter a score first.`}
        </p>
        <label className="sr-only" htmlFor="gradebook-comment">
          Comment
        </label>
        <textarea id="gradebook-comment" rows={2} value={comment} disabled={!canComment} onChange={(e) => setComment(e.target.value)} />
        <div>
          <button type="button" className="btn sm" disabled={!canComment} onClick={() => void saveComment()}>
            Save comment
          </button>
        </div>
      </div>
    </section>
  );
}
