'use client';
// Spike B (ADR-03) + host side of spike A (ADR-09): multi-file CodeMirror editor, Java package check,
// zip in the browser, and a Web preview served from the separate preview origin.
import { useEffect, useRef, useState, type ChangeEvent } from 'react';
import { basicSetup, EditorView } from 'codemirror';
import { EditorState, type Extension } from '@codemirror/state';
import { css } from '@codemirror/lang-css';
import { html } from '@codemirror/lang-html';
import { java } from '@codemirror/lang-java';
import { javascript } from '@codemirror/lang-javascript';
import { python } from '@codemirror/lang-python';
import { checkJavaPackages, fixPackage } from '@/lib/java-package';
import type { ProjectFile, SpikeProject } from '@/lib/spike-projects';
import { exportProject, importZip, ProjectError } from '@/lib/zip';

function languageFor(path: string): Extension {
  const ext = path.split('.').pop();
  if (ext === 'py') return python();
  if (ext === 'java') return java();
  if (ext === 'html' || ext === 'htm') return html();
  if (ext === 'css') return css();
  if (ext === 'js' || ext === 'json') return javascript();
  return [];
}

type ConsoleLine = { t: string; m: string };

export default function EditorSpike({ project, nonce, previewOrigin }: { project: SpikeProject; nonce: string; previewOrigin: string }) {
  const [files, setFiles] = useState<ProjectFile[]>(project.files);
  const [current, setCurrent] = useState(project.files[0].path);
  const [zipError, setZipError] = useState<string | null>(null);
  const [lines, setLines] = useState<ConsoleLine[]>([]);
  const [showFrame, setShowFrame] = useState(false);

  const host = useRef<HTMLDivElement>(null);
  const view = useRef<EditorView | null>(null);
  const filesRef = useRef(files);
  const currentRef = useRef(current);
  const states = useRef(new Map<string, EditorState>());
  const frame = useRef<HTMLIFrameElement>(null);
  const frameReady = useRef(false);
  filesRef.current = files;
  currentRef.current = current;

  const makeState = (path: string, doc: string) =>
    EditorState.create({
      doc,
      extensions: [
        basicSetup,
        languageFor(path),
        EditorView.cspNonce.of(nonce), // CodeMirror injects <style>; the nonce keeps the strict CSP happy
        EditorView.contentAttributes.of({ 'aria-label': `Code for ${path}` }),
        EditorView.updateListener.of((u) => {
          if (!u.docChanged) return;
          const text = u.state.doc.toString();
          setFiles((fs) => fs.map((f) => (f.path === currentRef.current ? { ...f, content: text } : f)));
        }),
      ],
    });

  useEffect(() => {
    const first = filesRef.current[0];
    view.current = new EditorView({ parent: host.current!, state: makeState(first.path, first.content) });
    return () => view.current?.destroy();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function openFile(path: string) {
    if (!view.current || path === currentRef.current) return;
    states.current.set(currentRef.current, view.current.state);
    const f = filesRef.current.find((x) => x.path === path)!;
    view.current.setState(states.current.get(path) ?? makeState(path, f.content));
    setCurrent(path);
  }

  function replaceProject(next: ProjectFile[]) {
    states.current.clear();
    setFiles(next);
    setCurrent(next[0].path);
    view.current?.setState(makeState(next[0].path, next[0].content));
  }

  // Preview: listen first, then load the frame, so its "ready" message is never missed.
  const sendFiles = () => frame.current?.contentWindow?.postMessage({ __files: 1, files: filesRef.current }, previewOrigin);
  useEffect(() => {
    if (project.lang !== 'web') return;
    const onMessage = (e: MessageEvent) => {
      if (e.source !== frame.current?.contentWindow || e.origin !== previewOrigin) return;
      if (e.data?.__pvReady) { frameReady.current = true; sendFiles(); }
      else if (e.data?.__pv === 1) setLines((l) => [...l.slice(-199), { t: String(e.data.t), m: String(e.data.m) }]);
    };
    window.addEventListener('message', onMessage);
    setShowFrame(true);
    return () => window.removeEventListener('message', onMessage);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    if (!frameReady.current) return;
    const t = setTimeout(() => { setLines([]); sendFiles(); }, 400);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [files]);

  async function download() {
    const data = await exportProject(filesRef.current);
    const url = URL.createObjectURL(new Blob([data as BlobPart], { type: 'application/zip' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `${project.id}.zip`;
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  async function upload(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      replaceProject(await importZip(new Uint8Array(await file.arrayBuffer())));
      setZipError(null);
    } catch (err) {
      setZipError(err instanceof ProjectError ? err.message : 'That file is not a zip we can open.');
    }
  }

  const problem = project.lang === 'java' ? checkJavaPackages(files).find((p) => p.path === current) : undefined;
  function fix() {
    if (!problem || !view.current) return;
    const doc = view.current.state.doc;
    view.current.dispatch({ changes: { from: 0, to: doc.length, insert: fixPackage(doc.toString(), problem.expected) } });
  }

  const sorted = [...files].sort((a, b) => a.path.localeCompare(b.path));
  return (
    <div className="workspace">
      <div className="toolbar">
        <button type="button" onClick={download}>Download .zip</button>
        <label className="upload">Upload .zip<input type="file" accept=".zip,application/zip" aria-label="Upload .zip" onChange={upload} /></label>
      </div>
      {zipError && <p className="error" data-testid="zip-error" role="alert">{zipError}</p>}
      {problem && (
        <p className="warning" data-testid="pkg-warning" role="status">
          <strong>{problem.path.split('/').pop()}</strong> says <code>package {problem.found ?? '(none)'};</code> but its folder means <code>package {problem.expected};</code>
          <button type="button" data-testid="pkg-fix" onClick={fix}>Change to package {problem.expected};</button>
        </p>
      )}
      <div className={project.lang === 'web' ? 'panes with-preview' : 'panes'}>
        <div className="ide">
          <nav className="tree" aria-label="Files">
            {sorted.map((f) => (
              <button key={f.path} type="button" data-testid="file" aria-current={f.path === current} onClick={() => openFile(f.path)} title={f.path}>
                {f.path}
              </button>
            ))}
          </nav>
          <div className="editor" ref={host} />
        </div>
        {project.lang === 'web' && (
          <div className="preview">
            {showFrame && (
              <iframe ref={frame} id="preview" title="Web page preview" src={`${previewOrigin}/frame`} sandbox="allow-scripts allow-same-origin allow-modals" />
            )}
            <div id="console" className="console" aria-live="polite">
              {lines.map((l, i) => <div key={i} className={l.t}>{l.t === 'log' ? '› ' : `${l.t}: `}{l.m}</div>)}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
