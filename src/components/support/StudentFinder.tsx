'use client';
import { useId, useState } from 'react';
import { Select } from '@/components/ui/Select';

// FR-ADM-18 (owner, 2026-10-31): find the students to add to a support line by typing part of a name or a class, or
// by choosing a class, instead of scrolling one long list. The students are grouped by class, in name order; Enter
// adds the only match, so a few names can be added from the keyboard one after another. Enrolling a student in a
// class (FR-ADM-07) uses it too, to choose one student: there a student is listed under each class they're in, and
// those in none under "Not in a class".
export type FinderStudent = { key: string; name: string; className: string; note?: string | null };
type Props = {
  candidates: FinderStudent[];
  onAdd: (c: FinderStudent) => void;
  title?: string | null; // null: no heading of its own (it sits in a form that has one)
  action?: string; // the button on each student
  done?: (name: string) => string; // what a screen reader hears after it
  empty?: string; // when there's nobody to list at all
  firstGroup?: string; // a group shown before the classes
};
const fold = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const byName = (a: string, b: string) => a.localeCompare(b, 'en', { sensitivity: 'base' });

export function StudentFinder({
  candidates,
  onAdd,
  title = 'Add students',
  action = 'Add',
  done = (name) => `${name} added.`,
  empty = 'Every student in a class is already in this support line.',
  firstGroup,
}: Props) {
  const id = useId();
  const [query, setQuery] = useState('');
  const [klass, setKlass] = useState('');
  const [added, setAdded] = useState('');

  const classes = [...new Set(candidates.map((c) => c.className))].sort(
    (a, b) => Number(b === firstGroup) - Number(a === firstGroup) || byName(a, b),
  );
  const q = fold(query.trim());
  const shown = candidates
    .filter((c) => !klass || c.className === klass)
    .filter((c) => !q || fold(c.name).includes(q) || fold(c.className).includes(q))
    .sort((a, b) => byName(a.className, b.className) || byName(a.name, b.name));
  const groups = classes.map((name) => ({ name, students: shown.filter((c) => c.className === name) })).filter((g) => g.students.length);

  function add(c: FinderStudent) {
    onAdd(c);
    setAdded(done(c.name));
  }

  return (
    <section className="finder stack-sm" aria-labelledby={title ? `${id}-title` : undefined}>
      {title && <h3 id={`${id}-title`}>{title}</h3>}
      <div className="finder-bar">
        <label className="f">
          Find a student
          <input
            type="search"
            value={query}
            placeholder="Type a name or a class"
            autoComplete="off"
            spellCheck={false}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key !== 'Enter') return;
              e.preventDefault(); // never sends the support line form
              if (shown.length === 1) {
                add(shown[0]!);
                setQuery('');
              }
            }}
          />
        </label>
        <label className="f">
          Class
          <Select value={klass} onChange={(e) => setKlass(e.target.value)}>
            <option value="">{`All classes (${candidates.length})`}</option>
            {classes.map((name) => (
              <option key={name} value={name}>
                {`${name} (${candidates.filter((c) => c.className === name).length})`}
              </option>
            ))}
          </Select>
        </label>
      </div>
      <p className="sr-only" aria-live="polite" data-testid="finder-said">
        {added}
      </p>
      <div className="finder-list">
        {groups.length === 0 ? (
          <p className="small muted">
            {candidates.length === 0 ? empty : q ? `No student matches “${query.trim()}”.` : 'No student in this class is left to add.'}
          </p>
        ) : (
          groups.map((g) => (
            <div key={g.name} role="group" aria-label={g.name} className="finder-group">
              <div className="finder-class xs muted">{g.name}</div>
              <ul>
                {g.students.map((c) => (
                  <li key={c.key}>
                    <span>
                      {c.name}
                      {c.note && <span className="xs muted"> · {c.note}</span>}
                    </span>
                    <button type="button" className="btn sm" aria-label={`${action} ${c.name}`} onClick={() => add(c)}>
                      {action}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ))
        )}
      </div>
    </section>
  );
}
