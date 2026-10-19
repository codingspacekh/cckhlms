// A new page opens at the top; Back and Forward put you back where you were; the first load is left alone.
import { cleanup, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

let pathname = '/teacher/classes/c1';
vi.mock('next/navigation', () => ({ usePathname: () => pathname }));
const { ScrollReset } = await import('@/components/shell/ScrollReset');

const scrollTo = vi.fn();
// The user scrolls: jsdom has no layout, so set scrollY and fire the event by hand.
const scrolledTo = (y: number) => {
  Object.defineProperty(window, 'scrollY', { value: y, configurable: true });
  window.dispatchEvent(new Event('scroll'));
};
beforeEach(() => {
  pathname = '/teacher/classes/c1';
  window.scrollTo = scrollTo as unknown as typeof window.scrollTo;
});
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  scrollTo.mockReset();
});

describe('ScrollReset', () => {
  it('leaves the first load alone', () => {
    render(<ScrollReset />);
    expect(scrollTo).not.toHaveBeenCalled();
  });

  it('opens a new page at the top', () => {
    const { rerender } = render(<ScrollReset />);
    pathname = '/teacher/classes/c1/weeks/3';
    rerender(<ScrollReset />);
    expect(scrollTo).toHaveBeenCalledWith(0, 0);
  });

  it('puts you back where you were on Back and Forward', () => {
    const { rerender } = render(<ScrollReset />);
    scrolledTo(900); // part-way down the class page
    pathname = '/teacher/classes/c1/weeks/3';
    rerender(<ScrollReset />);
    expect(scrollTo).toHaveBeenLastCalledWith(0, 0);
    scrolledTo(120);

    window.dispatchEvent(new PopStateEvent('popstate')); // Back
    pathname = '/teacher/classes/c1';
    rerender(<ScrollReset />);
    expect(scrollTo).toHaveBeenLastCalledWith(0, 900);

    window.dispatchEvent(new PopStateEvent('popstate')); // Forward
    pathname = '/teacher/classes/c1/weeks/3';
    rerender(<ScrollReset />);
    expect(scrollTo).toHaveBeenLastCalledWith(0, 120);
  });

  it('on Back, keeps trying while the page is still too short to reach the old position', () => {
    let grow = () => {};
    const disconnect = vi.fn();
    vi.stubGlobal(
      'ResizeObserver',
      class {
        constructor(cb: () => void) {
          grow = cb;
        }
        observe() {}
        disconnect = disconnect;
      },
    );
    scrollTo.mockImplementation((_x: number, y: number) => scrolledTo(Math.min(y, 300))); // the page can only scroll 300px so far
    const { rerender } = render(<ScrollReset />);
    scrolledTo(900);
    pathname = '/teacher/classes/c1/weeks/3';
    rerender(<ScrollReset />);
    window.dispatchEvent(new PopStateEvent('popstate'));
    pathname = '/teacher/classes/c1';
    rerender(<ScrollReset />);
    expect(window.scrollY).toBe(300);

    scrollTo.mockImplementation((_x: number, y: number) => scrolledTo(y)); // the rest of the page arrives
    grow();
    expect(window.scrollY).toBe(900);
    expect(disconnect).toHaveBeenCalled();
    vi.unstubAllGlobals();
  });

  it('goes to the top on Back to a page it has no position for', () => {
    const { rerender } = render(<ScrollReset />);
    window.dispatchEvent(new PopStateEvent('popstate'));
    pathname = '/teacher';
    rerender(<ScrollReset />);
    expect(scrollTo).toHaveBeenLastCalledWith(0, 0);
  });

  it('takes over scroll restoration from the browser', () => {
    render(<ScrollReset />);
    expect(history.scrollRestoration).toBe('manual');
  });

  it('does nothing when only the page data refreshes', () => {
    const { rerender } = render(<ScrollReset />);
    rerender(<ScrollReset />);
    expect(scrollTo).not.toHaveBeenCalled();
  });
});
