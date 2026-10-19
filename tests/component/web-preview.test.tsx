// FR-CODE-04 · ADR 0001: the LMS side of the Web preview: it sends the files only to the preview origin, once
// the frame says it's ready, and shows console lines only from that frame.
import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { WebPreview } from '@/components/editor/WebPreview';

const ORIGIN = 'http://preview.localhost:3102';
const files = [{ path: 'index.html', content: '<h1>Hi</h1>' }];
beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  vi.useRealTimers();
  cleanup();
});

const frameWindow = () => (screen.getByTitle('Web page preview') as HTMLIFrameElement).contentWindow!;
const fromFrame = (data: unknown, opts: { origin?: string; source?: Window | null } = {}) =>
  act(() => {
    window.dispatchEvent(
      new MessageEvent('message', { data, origin: opts.origin ?? ORIGIN, source: opts.source === undefined ? frameWindow() : opts.source }),
    );
  });

describe('WebPreview', () => {
  it('embeds the preview origin in a sandbox, and sends the files when the frame is ready', () => {
    render(<WebPreview files={files} previewOrigin={ORIGIN} />);
    const iframe = screen.getByTitle('Web page preview') as HTMLIFrameElement;
    expect(iframe.getAttribute('src')).toBe(`${ORIGIN}/frame`);
    expect(iframe.getAttribute('sandbox')).toBe('allow-scripts allow-same-origin allow-modals');
    const post = vi.spyOn(frameWindow(), 'postMessage');
    fromFrame({ __pvReady: 1 });
    expect(post).toHaveBeenCalledWith({ __files: 1, files }, ORIGIN);
  });

  it('shows console lines from the frame, and ignores messages from anywhere else', () => {
    render(<WebPreview files={files} previewOrigin={ORIGIN} />);
    fromFrame({ __pv: 1, t: 'log', m: 'page loaded' });
    fromFrame({ __pv: 1, t: 'error', m: 'x is not defined (line 3)' });
    fromFrame({ __pv: 1, t: 'log', m: 'from another site' }, { origin: 'http://evil.localhost' });
    fromFrame({ __pv: 1, t: 'log', m: 'from another window' }, { source: window });
    expect(screen.getByRole('log', { name: 'Console' }).textContent).toBe('› page loadederror: x is not defined (line 3)');
  });

  it('sends the files again a moment after they change, with a fresh console', () => {
    const { rerender } = render(<WebPreview files={files} previewOrigin={ORIGIN} />);
    const post = vi.spyOn(frameWindow(), 'postMessage');
    fromFrame({ __pvReady: 1 });
    fromFrame({ __pv: 1, t: 'log', m: 'old run' });
    const next = [{ path: 'index.html', content: '<h1>Changed</h1>' }];
    rerender(<WebPreview files={next} previewOrigin={ORIGIN} />);
    act(() => vi.advanceTimersByTime(500));
    expect(post).toHaveBeenLastCalledWith({ __files: 1, files: next }, ORIGIN);
    expect(screen.getByRole('log', { name: 'Console' }).textContent).toBe('');
  });

  it('“Run again” reloads the page with the same files', () => {
    render(<WebPreview files={files} previewOrigin={ORIGIN} />);
    const post = vi.spyOn(frameWindow(), 'postMessage');
    fromFrame({ __pvReady: 1 });
    act(() => screen.getByRole('button', { name: 'Run again' }).click());
    expect(post).toHaveBeenCalledTimes(2);
  });
});
