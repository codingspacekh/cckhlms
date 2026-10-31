'use client';
import { useState, type FormEvent } from 'react';
import { checkNewPath } from '@/lib/project/files';

type Props = {
  paths: string[];
  current: string;
  readOnly?: boolean;
  onOpen: (path: string) => void;
  onAdd: (path: string) => void;
  onRename: (from: string, to: string) => void;
  onDelete: (path: string) => void;
};
type Row = { kind: 'folder'; name: string; depth: number; key: string } | { kind: 'file'; name: string; depth: number; path: string };

// Files at the top first, then each folder with its files; folders are just the paths' parts (Java packages).
function rowsOf(paths: string[]): Row[] {
  const sorted = [...paths].sort((a, b) => {
    const da = a.includes('/') ? 1 : 0;
    const db = b.includes('/') ? 1 : 0;
    return da - db || a.localeCompare(b);
  });
  const rows: Row[] = [];
  const shown = new Set<string>();
  for (const path of sorted) {
    const parts = path.split('/');
    parts.slice(0, -1).forEach((name, i) => {
      const key = parts.slice(0, i + 1).join('/');
      if (!shown.has(key)) rows.push({ kind: 'folder', name, depth: i, key });
      shown.add(key);
    });
    rows.push({ kind: 'file', name: parts.at(-1)!, depth: parts.length - 1, path });
  }
  return rows;
}

// FR-CODE-02: the project's files; new file, rename and delete act on the open file.
export function FileTree({ paths, current, readOnly = false, onOpen, onAdd, onRename, onDelete }: Props) {
  const [mode, setMode] = useState<'add' | 'rename' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const name = current.split('/').pop()!;

  function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const typed = String(new FormData(e.currentTarget).get('path') ?? '');
    const r = checkNewPath(paths, typed, mode === 'rename' ? current : undefined);
    if ('error' in r) return setError(r.error);
    if (mode === 'add') onAdd(r.path);
    else if (r.path !== current) onRename(current, r.path);
    setMode(null);
    setError(null);
  }

  return (
    <div className="tree">
      {!readOnly && (
        <div className="tree-actions">
          <button type="button" className="btn sm" onClick={() => (setMode('add'), setError(null), setConfirmDelete(false))}>
            New file
          </button>
          <button
            type="button"
            className="btn sm ghost"
            aria-label={`Rename ${name}`}
            onClick={() => (setMode('rename'), setError(null), setConfirmDelete(false))}
          >
            Rename
          </button>
          {confirmDelete ? (
            <button type="button" className="btn sm" onClick={() => (onDelete(current), setConfirmDelete(false))}>
              Yes, delete {name}
            </button>
          ) : (
            <button
              type="button"
              className="btn sm ghost"
              aria-label={`Delete ${name}`}
              disabled={paths.length <= 1}
              onClick={() => (setConfirmDelete(true), setMode(null))}
            >
              Delete
            </button>
          )}
        </div>
      )}
      {mode && (
        <form method="post" className="stack-sm tree-form" aria-label={mode === 'add' ? 'New file' : 'Rename file'} onSubmit={submit}>
          <label className="f">
            File name
            <input
              name="path"
              type="text"
              defaultValue={mode === 'rename' ? current : ''}
              placeholder={mode === 'add' ? 'e.g. game.py or src/game/Player.java' : undefined}
              autoComplete="off"
              autoCapitalize="none"
              spellCheck={false}
              autoFocus
            />
          </label>
          {error && (
            <p className="note bad" role="alert">
              {error}
            </p>
          )}
          <div className="row nowrap">
            <button type="submit" className="btn sm primary">
              {mode === 'add' ? 'Add' : 'Rename'}
            </button>
            <button type="button" className="btn sm ghost" onClick={() => setMode(null)}>
              Cancel
            </button>
          </div>
        </form>
      )}
      <nav aria-label="Files">
        <ul className="plain">
          {rowsOf(paths).map((r) =>
            r.kind === 'folder' ? (
              <li key={`d:${r.key}`} className="folder" data-depth={r.depth}>
                {r.name}/
              </li>
            ) : (
              <li key={`f:${r.path}`} data-depth={r.depth}>
                <button
                  type="button"
                  className="file"
                  title={r.path}
                  aria-current={r.path === current ? 'true' : undefined}
                  onClick={() => onOpen(r.path)}
                >
                  {r.name}
                </button>
              </li>
            ),
          )}
        </ul>
      </nav>
    </div>
  );
}
