// FR-STU-12 (M9): the Copy button on a lesson note's code block puts exactly that block's code on the clipboard,
// says so, and turns back after a moment.
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NoteHtml } from '@/components/teaching/NoteHtml';
import { renderNote } from '@/lib/markdown';

const writeText = vi.fn();
beforeEach(() => {
  Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
  writeText.mockResolvedValue(undefined);
});
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  vi.useRealTimers();
});

const NOTE = renderNote('```python\nfor i in range(3):\n    print(i)\n```\n\nThen:\n\n```html\n<p>Hi</p>\n```');

describe('NoteHtml', () => {
  it('copies the code of the block whose button was pressed', async () => {
    render(<NoteHtml html={NOTE} />);
    const [first, second] = screen.getAllByRole('button', { name: 'Copy' });
    await act(async () => fireEvent.click(second!));
    expect(writeText).toHaveBeenCalledWith('<p>Hi</p>');
    await act(async () => fireEvent.click(first!));
    expect(writeText).toHaveBeenLastCalledWith('for i in range(3):\n    print(i)');
  });

  it('says the code was copied, then shows Copy again', async () => {
    vi.useFakeTimers();
    render(<NoteHtml html={NOTE} />);
    await act(async () => fireEvent.click(screen.getAllByRole('button', { name: 'Copy' })[0]!));
    expect(screen.getByRole('button', { name: 'Copied' })).toBeTruthy();
    expect(screen.getByTestId('copy-status').textContent).toBe('Code copied');
    act(() => vi.advanceTimersByTime(2500));
    expect(screen.getAllByRole('button', { name: 'Copy' })).toHaveLength(2);
    expect(screen.getByTestId('copy-status').textContent).toBe('');
  });

  it('tells the student how to copy by hand when the browser won’t', async () => {
    writeText.mockRejectedValue(new Error('denied'));
    render(<NoteHtml html={NOTE} />);
    await act(async () => fireEvent.click(screen.getAllByRole('button', { name: 'Copy' })[0]!));
    expect(screen.getByTestId('copy-status').textContent).toBe('Couldn’t copy. Select the code and copy it instead.');
  });

  it('ignores clicks elsewhere in the note', async () => {
    render(<NoteHtml html={NOTE} />);
    await act(async () => fireEvent.click(screen.getByText('Then:')));
    expect(writeText).not.toHaveBeenCalled();
  });
});
