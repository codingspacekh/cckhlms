'use client';
// FR-CODE-04 · ADR 0001: the student's page runs on the preview origin (preview.cckh.dev), never on the LMS.
// The frame builds the page from the files we post to it and relays console output back. Messages go only
// to the preview origin, and only messages from that frame are read.
import { useEffect, useRef, useState } from 'react';
import type { ProjectFile } from '@/lib/project/files';

type Line = { t: string; m: string };
const MAX_LINES = 200;

export function WebPreview({ files, previewOrigin }: { files: ProjectFile[]; previewOrigin: string }) {
  const frame = useRef<HTMLIFrameElement>(null);
  const ready = useRef(false);
  const filesRef = useRef(files);
  const [lines, setLines] = useState<Line[]>([]);

  const send = () => {
    setLines([]);
    frame.current?.contentWindow?.postMessage({ __files: 1, files: filesRef.current }, previewOrigin);
  };

  // Listen first, then load the frame (its src is set here), so its "ready" message is never missed
  // (ADR 0001, finding 4).
  useEffect(() => {
    const onMessage = (e: MessageEvent) => {
      if (e.source !== frame.current?.contentWindow || e.origin !== previewOrigin) return;
      if (e.data?.__pvReady) {
        ready.current = true;
        send();
      } else if (e.data?.__pv === 1) setLines((l) => [...l.slice(-(MAX_LINES - 1)), { t: String(e.data.t), m: String(e.data.m) }]);
    };
    window.addEventListener('message', onMessage);
    if (frame.current) frame.current.src = `${previewOrigin}/frame`;
    return () => window.removeEventListener('message', onMessage);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- set up once; send() reads refs
  }, [previewOrigin]);

  // Edits show up a moment after typing stops.
  useEffect(() => {
    filesRef.current = files;
    if (!ready.current) return;
    const t = setTimeout(send, 400);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- send() reads refs
  }, [files]);

  return (
    <section className="web-preview" aria-labelledby="preview-title">
      <div className="spread">
        <h3 id="preview-title">Preview</h3>
        <button type="button" className="btn sm" onClick={send}>
          Run again
        </button>
      </div>
      <div className="preview-frame">
        <iframe ref={frame} title="Web page preview" sandbox="allow-scripts allow-same-origin allow-modals" />
      </div>
      <div className="console" role="log" aria-label="Console" aria-live="polite">
        {lines.map((l, i) => (
          <div key={i} className={`line ${l.t}`}>
            {l.t === 'log' || l.t === 'info' ? '› ' : `${l.t}: `}
            {l.m}
          </div>
        ))}
      </div>
    </section>
  );
}
