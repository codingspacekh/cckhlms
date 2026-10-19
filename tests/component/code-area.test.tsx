// FR-CODE-01 · ADR 0002: the CodeMirror area keeps each file's own state while switching between files.
import { act, cleanup, render, screen } from '@testing-library/react';
import { createRef } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CodeArea, type CodeAreaHandle } from '@/components/editor/CodeArea';

afterEach(cleanup);
const box = (path: string) => screen.getByRole('textbox', { name: `Code for ${path}` });

describe('CodeArea', () => {
  it('shows the open file, reports edits, and switches files without losing them', async () => {
    const onChange = vi.fn();
    const ref = createRef<CodeAreaHandle>();
    const props = { nonce: 'n', resetKey: 0, onChange };
    const { rerender } = render(<CodeArea ref={ref} path="main.py" doc="print(1)" {...props} />);
    expect(box('main.py').textContent).toBe('print(1)');

    act(() => ref.current!.replaceDoc('print(2)'));
    expect(onChange).toHaveBeenLastCalledWith('main.py', 'print(2)');

    rerender(<CodeArea ref={ref} path="util.py" doc="x = 1" {...props} />);
    expect(box('util.py').textContent).toBe('x = 1');
    rerender(<CodeArea ref={ref} path="main.py" doc="print(1)" {...props} />);
    expect(box('main.py').textContent).toBe('print(2)'); // its own state came back, not the doc passed in
    await act(async () => {}); // let the Python language load
  });

  it('starts again from the files given after a reset, and can be read-only', () => {
    const ref = createRef<CodeAreaHandle>();
    const onChange = vi.fn();
    const { rerender } = render(<CodeArea ref={ref} path="a.txt" doc="one" nonce="n" resetKey={0} onChange={onChange} />);
    act(() => ref.current!.replaceDoc('edited'));
    rerender(<CodeArea ref={ref} path="a.txt" doc="from zip" nonce="n" resetKey={1} onChange={onChange} />);
    expect(box('a.txt').textContent).toBe('from zip');
    cleanup();
    render(<CodeArea path="b.txt" doc="look only" nonce="n" resetKey={0} readOnly onChange={onChange} />);
    expect(box('b.txt').getAttribute('contenteditable')).toBe('false');
  });
});
