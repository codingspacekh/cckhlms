'use client';
// The multi-file editor (FR-CODE-01/02/03): file tree, code, upload files or a .zip, download a .zip, and the
// Java package check with a one-click fix. It reports every change; the page decides when to save.
import { useRef, useState, type ChangeEvent } from 'react';
import { checkProject, ProjectError, type ProjectFile } from '@/lib/project/files';
import { checkJavaPackages, fixPackage } from '@/lib/project/java-package';
import { exportProject, importZip } from '@/lib/project/zip';
import { CodeArea, type CodeAreaHandle } from './CodeArea';
import { FileTree } from './FileTree';
import { WebPreview } from './WebPreview';

type Props = {
  initial: ProjectFile[];
  nonce: string;
  zipName: string; // without .zip
  java?: boolean;
  readOnly?: boolean;
  previewOrigin?: string; // Web work: show the page from the preview origin (FR-CODE-04)
  // `now`: a whole-file change (upload, new file, rename, delete, package fix) to save at once; typing can wait.
  onChange?: (files: ProjectFile[], now: boolean) => void;
};

const firstFile = (files: ProjectFile[]) =>
  (
    files.find((f) => /(^|\/)(main\.py|Main\.java|index\.html)$/.test(f.path)) ??
    [...files].sort((a, b) => a.path.localeCompare(b.path))[0]!
  ).path;

export function ProjectEditor({ initial, nonce, zipName, java = false, readOnly = false, previewOrigin, onChange }: Props) {
  const [files, setFiles] = useState(initial);
  const [current, setCurrent] = useState(() => firstFile(initial));
  const [resetKey, setResetKey] = useState(0);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const code = useRef<CodeAreaHandle>(null);
  const filesRef = useRef(files);

  function update(next: ProjectFile[], opts: { reset?: boolean; open?: string; now?: boolean } = {}) {
    filesRef.current = next;
    setFiles(next);
    if (opts.open) setCurrent(opts.open);
    if (opts.reset) setResetKey((k) => k + 1);
    onChange?.(next, opts.now ?? !!opts.reset);
  }
  const fixing = useRef(false);
  const fail = (e: unknown) => setMessage({ ok: false, text: e instanceof ProjectError ? e.message : 'That didn’t work. Try again.' });

  async function upload(e: ChangeEvent<HTMLInputElement>) {
    const picked = [...(e.target.files ?? [])];
    e.target.value = '';
    if (!picked.length) return;
    try {
      const zip = picked.find((f) => f.name.toLowerCase().endsWith('.zip'));
      if (zip) {
        const next = await importZip(new Uint8Array(await zip.arrayBuffer()));
        update(next, { reset: true, open: firstFile(next) });
        setMessage({ ok: true, text: `Opened ${zip.name}: ${next.length} file${next.length === 1 ? '' : 's'}.` });
        return;
      }
      // Single files go at the top of the project, replacing a file with the same name.
      const added = await Promise.all(picked.map(async (f) => ({ path: f.name, content: await f.text() })));
      const next = [...filesRef.current.filter((f) => !added.some((a) => a.path.toLowerCase() === f.path.toLowerCase())), ...added];
      checkProject(next);
      update(next, { reset: true, open: added[0]!.path });
      setMessage({ ok: true, text: `Added ${added.map((a) => a.path).join(', ')}.` });
    } catch (err) {
      fail(err);
    }
  }

  function download() {
    try {
      const data = exportProject(filesRef.current);
      const url = URL.createObjectURL(new Blob([data as BlobPart], { type: 'application/zip' }));
      const a = document.createElement('a');
      a.href = url;
      a.download = `${zipName}.zip`;
      document.body.append(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (err) {
      fail(err);
    }
  }

  const problem = java ? checkJavaPackages(files).find((p) => p.path === current) : undefined;
  const doc = files.find((f) => f.path === current)?.content ?? '';

  return (
    <div className="project">
      <div className="project-bar">
        {!readOnly && (
          <label className="btn sm">
            Upload files or .zip
            <input
              type="file"
              multiple
              accept=".zip,.py,.java,.html,.htm,.css,.js,.json,.txt,.md,.csv"
              className="sr-only"
              onChange={upload}
            />
          </label>
        )}
        <button type="button" className="btn sm" onClick={download}>
          Download .zip
        </button>
        {message && (
          <span className={`small ${message.ok ? 'muted' : 'bad-text'}`} role={message.ok ? 'status' : 'alert'}>
            {message.text}
          </span>
        )}
      </div>
      {problem && !readOnly && (
        <p className="note warn" role="status" data-testid="package-warning">
          <span>
            <strong>{problem.path.split('/').pop()}</strong> says <code>package {problem.found ?? '(none)'};</code> but its folder means{' '}
            {problem.expected ? <code>package {problem.expected};</code> : 'no package line'}.
          </span>{' '}
          <button
            type="button"
            className="btn sm"
            onClick={() => {
              fixing.current = true;
              code.current?.replaceDoc(fixPackage(doc, problem.expected));
              fixing.current = false;
            }}
          >
            {problem.expected ? `Change to package ${problem.expected};` : 'Remove the package line'}
          </button>
        </p>
      )}
      <div className="ide">
        <FileTree
          paths={files.map((f) => f.path)}
          current={current}
          readOnly={readOnly}
          onOpen={setCurrent}
          onAdd={(path) => update([...filesRef.current, { path, content: '' }], { open: path, now: true })}
          onRename={(from, to) =>
            update(
              filesRef.current.map((f) => (f.path === from ? { ...f, path: to } : f)),
              { reset: true, open: to },
            )
          }
          onDelete={(path) => {
            const next = filesRef.current.filter((f) => f.path !== path);
            update(next, { reset: true, open: firstFile(next) });
          }}
        />
        <CodeArea
          ref={code}
          path={current}
          doc={doc}
          nonce={nonce}
          readOnly={readOnly}
          resetKey={resetKey}
          onChange={(path, text) =>
            update(
              filesRef.current.map((f) => (f.path === path ? { ...f, content: text } : f)),
              { now: fixing.current },
            )
          }
        />
      </div>
      {previewOrigin && <WebPreview files={files} previewOrigin={previewOrigin} />}
    </div>
  );
}
