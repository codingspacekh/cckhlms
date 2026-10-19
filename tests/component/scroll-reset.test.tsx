// A new page opens at the top; Back/Forward and the first load keep the browser's own scroll position.
import { cleanup, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

let pathname = '/teacher/classes/c1';
vi.mock('next/navigation', () => ({ usePathname: () => pathname }));
const { ScrollReset } = await import('@/components/shell/ScrollReset');

const scrollTo = vi.fn();
beforeEach(() => {
  pathname = '/teacher/classes/c1';
  window.scrollTo = scrollTo as unknown as typeof window.scrollTo;
});
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
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

  it('keeps the position on Back and Forward', () => {
    const { rerender } = render(<ScrollReset />);
    window.dispatchEvent(new PopStateEvent('popstate'));
    pathname = '/teacher';
    rerender(<ScrollReset />);
    expect(scrollTo).not.toHaveBeenCalled();

    pathname = '/teacher/classes/c1'; // the next ordinary link goes to the top again
    rerender(<ScrollReset />);
    expect(scrollTo).toHaveBeenCalledWith(0, 0);
  });

  it('does nothing when only the page data refreshes', () => {
    const { rerender } = render(<ScrollReset />);
    rerender(<ScrollReset />);
    expect(scrollTo).not.toHaveBeenCalled();
  });
});
