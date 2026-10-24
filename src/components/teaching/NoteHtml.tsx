'use client';
import { useEffect, useRef, useState, type MouseEvent } from 'react';

const COPIED_FOR_MS = 2000;

// A lesson note rendered by renderNote (FR-STU-12). Its code blocks' Copy buttons come in the HTML, so one click
// handler here serves them all: the buttons are real <button>s, so they work from the keyboard too.
export function NoteHtml({ html }: { html: string }) {
  const [status, setStatus] = useState('');
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);

  async function copy(e: MouseEvent<HTMLDivElement>) {
    const button = (e.target as Element).closest('button.code-copy');
    const code = button?.closest('.code-block')?.querySelector('code')?.textContent;
    if (!button || code == null) return;
    clearTimeout(timer.current);
    try {
      await navigator.clipboard.writeText(code);
    } catch {
      setStatus('Couldn’t copy. Select the code and copy it instead.');
      return;
    }
    button.textContent = 'Copied';
    setStatus('Code copied');
    timer.current = setTimeout(() => {
      button.textContent = 'Copy';
      setStatus('');
    }, COPIED_FOR_MS);
  }

  return (
    <>
      {/* Sanitised by renderNote on the server (src/lib/markdown.ts). */}
      <div className="md reading" onClick={copy} dangerouslySetInnerHTML={{ __html: html }} />
      {/* A plain live region, not role="status", so it doesn't compete with the page's own status messages. */}
      <span aria-live="polite" className="sr-only" data-testid="copy-status">
        {status}
      </span>
    </>
  );
}
