'use client';
// The multi-file editor (FR-CODE-01/02/03): file tree, code, upload files, a folder or a .zip, download a .zip,
// and the Java package check with a one-click fix. Python and Java get the Run panel beside the code (M11). Pictures open in a viewer instead of the code area. It reports
// every change; the page decides when to save.
import { useEffect, useRef, useState, type ChangeEvent } from 'react';
import { ALLOWED_EXTENSIONS, checkProject, imageInfo, isImagePath, ProjectError, type ProjectFile } from '@/lib/project/files';
import { checkJavaPackages, fixPackage } from '@/lib/project/java-package';
import { fitImage } from '@/lib/project/shrink';
import { checkPicked, mergeFiles, placePicked, toProjectFiles, type FitImage } from '@/lib/project/upload';
import { exportProject, importZip } from '@/lib/project/zip';
import { CodeArea, type CodeAreaHandle } from './CodeArea';
import { FileTree } from './FileTree';
import { RunPanel } from './RunPanel';
import { WebPreview } from './WebPreview';

type Props = {
  initial: ProjectFile[];
  nonce: string;
  zipName: string; // without .zip
  java?: boolean;
  readOnly?: boolean;
  previewOrigin?: string; // Web work: show the page from the preview origin (FR-CODE-04)
  run?: 'python' | 'java'; // Python and Java: the Run panel (M11)
  // `now`: a whole-file change (upload, new file, rename, delete, package fix) to save at once; typing can wait.
  onChange?: (files: ProjectFile[], now: boolean) => void;
};

const firstFile = (files: ProjectFile[]) =>
  (
    files.find((f) => /(^|\/)(main\.py|Main\.java|index\.html)$/.test(f.path)) ??
    [...files].sort((a, b) => Number(isImagePath(a.path)) - Number(isImagePath(b.path)) || a.path.localeCompare(b.path))[0]!
  ).path;
const names = (paths: string[]) => paths.map((p) => p.split('/').pop()).join(', ');
const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;
const ACCEPT = ['.zip', ...ALLOWED_EXTENSIONS.map((e) => `.${e}`)].join(',');

// A picture in the project, with how to use it in a page.
function ImageView({ file, web }: { file: ProjectFile; web: boolean }) {
  const kb = Math.max(1, Math.round((imageInfo(file.content)?.bytes ?? 0) / 1024));
  return (
    <figure className="image-view">
      <div className="image-frame">
        <img src={file.content} alt={`The picture ${file.path}`} />
      </div>
      <figcaption className="small muted">
        {file.path} · {kb} KB
        {web && (
          <>
            {' '}
            · Use it in your page: <code>{`<img src="${file.path}" alt="…">`}</code>
          </>
        )}
      </figcaption>
    </figure>
  );
}

export function ProjectEditor({ initial, nonce, zipName, java = false, readOnly = false, previewOrigin, run, onChange }: Props) {
  const [files, setFiles] = useState(initial);
  const [current, setCurrent] = useState(() => firstFile(initial));
  const [resetKey, setResetKey] = useState(0);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const code = useRef<CodeAreaHandle>(null);
  const filesRef = useRef(files);
  // "Go to line" from the Run panel: open the file first; the code area has switched to it by the time this runs.
  const [goTo, setGoTo] = useState<{ path: string; line: number; at: number } | null>(null);
  useEffect(() => {
    if (goTo && goTo.path === current) code.current?.goToLine(goTo.line);
  }, [goTo, current]);

  function update(next: ProjectFile[], opts: { reset?: boolean; open?: string; now?: boolean } = {}) {
    filesRef.current = next;
    setFiles(next);
    if (opts.open) setCurrent(opts.open);
    if (opts.reset) setResetKey((k) => k + 1);
    onChange?.(next, opts.now ?? !!opts.reset);
  }
  const fixing = useRef(false);
  const fail = (e: unknown) => setMessage({ ok: false, text: e instanceof ProjectError ? e.message : 'That didn’t work. Try again.' });

  async function upload(e: ChangeEvent<HTMLInputElement>, folder = false) {
    const picked = [...(e.target.files ?? [])];
    e.target.value = '';
    if (!picked.length) return;
    // Photos bigger than the limit are made smaller in the browser; the message says which.
    const shrunk: string[] = [];
    const fit: FitImage = async (path, bytes) => {
      const out = await fitImage(path, bytes);
      if (out !== bytes) shrunk.push(path);
      return out;
    };
    const smaller = () => (shrunk.length ? ` Made ${names(shrunk)} smaller to fit.` : '');
    try {
      const zip = folder ? undefined : picked.find((f) => f.name.toLowerCase().endsWith('.zip'));
      if (zip) {
        const next = await importZip(new Uint8Array(await zip.arrayBuffer()), fit);
        update(next, { reset: true, open: firstFile(next) });
        setMessage({ ok: true, text: `Opened ${zip.name}: ${plural(next.length, 'file')}.${smaller()}` });
        return;
      }
      // Single files go at the top of the project, a folder's files in their folders; either replaces a file with
      // the same name.
      const { placed, skipped } = placePicked(
        picked.map((f) => (folder ? f.webkitRelativePath || f.name : f.name)),
        folder,
      );
      const chosen = picked.flatMap((file, i) => (placed[i] ? [{ file, path: placed[i] }] : []));
      if (!chosen.length) throw new ProjectError('bad-type', names(skipped) || undefined);
      checkPicked(chosen.map((c) => ({ path: c.path, size: c.file.size })));
      const added = await toProjectFiles(
        await Promise.all(chosen.map(async (c) => ({ path: c.path, bytes: new Uint8Array(await c.file.arrayBuffer()) }))),
        fit,
      );
      const next = mergeFiles(filesRef.current, added);
      checkProject(next);
      update(next, { reset: true, open: firstFile(added) });
      const left = skipped.length
        ? ` Left out ${names(skipped)}: a project can’t hold ${skipped.length === 1 ? 'that type' : 'those types'}.`
        : '';
      setMessage({
        ok: true,
        text: `${folder ? `Added ${plural(added.length, 'file')} from the folder.` : `Added ${names(added.map((a) => a.path))}.`}${smaller()}${left}`,
      });
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
  const open = files.find((f) => f.path === current);
  const doc = open?.content ?? '';

  return (
    <div className="project">
      <div className="project-bar">
        {!readOnly && (
          <>
            <label className="btn sm">
              Upload files or .zip
              <input type="file" multiple accept={ACCEPT} className="sr-only" onChange={(e) => upload(e)} />
            </label>
            <label className="btn sm">
              Upload folder
              {/* webkitdirectory picks a whole folder (every current browser); React passes it through as-is. */}
              <input type="file" multiple className="sr-only" onChange={(e) => upload(e, true)} {...{ webkitdirectory: '' }} />
            </label>
          </>
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
      <div className={`project-main${run ? ' runnable' : ''}`}>
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
          {open && isImagePath(open.path) ? (
            <ImageView file={open} web={!!previewOrigin} />
          ) : (
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
          )}
        </div>
        {run && (
          <RunPanel
            language={run}
            files={files}
            onGoTo={(path, line) => {
              setCurrent(path);
              setGoTo({ path, line, at: Date.now() });
            }}
          />
        )}
      </div>
      {previewOrigin && <WebPreview files={files} previewOrigin={previewOrigin} />}
    </div>
  );
}
