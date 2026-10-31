// M11 · FR-CODE-09/10: the Run panel beside the code for Python and Java (prototype boards 1–2).
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

const runCodeAction = vi.fn();
vi.mock('@/modules/running/actions', () => ({ runCodeAction: (...a: unknown[]) => runCodeAction(...a) }));
const { RunPanel } = await import('@/components/editor/RunPanel');

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const result = (over: Record<string, unknown> = {}) => ({
  ok: true,
  data: { status: 'ok', stdout: '', stderr: '', exitCode: 0, ms: 412, truncated: false, mainClass: null, ...over },
});
const pyFiles = [
  { path: 'main.py', content: 'name = input("Name? ")\nprint("Hi", name)' },
  { path: 'cat.png', content: 'data:image/png;base64,iVBORw0KGgo=' },
];
const output = () => screen.getByRole('log', { name: 'Output' });
const run = () => fireEvent.click(screen.getByRole('button', { name: 'Run' }));

describe('RunPanel', () => {
  it('runs the files with the Input box, and shows the output with the input lines marked', async () => {
    runCodeAction.mockResolvedValue(result({ stdout: 'Name? \x1eDara\x1f\nHi Dara\n' }));
    render(<RunPanel language="python" files={pyFiles} onGoTo={vi.fn()} />);
    expect(screen.getByText('Python 3.12')).toBeTruthy();
    expect(within(output()).getByText(/Press Run/)).toBeTruthy();
    fireEvent.change(screen.getByLabelText(/^Input/), { target: { value: 'Dara' } });
    run();
    expect(await screen.findByText('Finished in 0.4 s')).toBeTruthy();
    expect(runCodeAction).toHaveBeenCalledWith({ language: 'python', files: pyFiles, stdin: 'Dara\n' });
    expect(output().textContent).toBe('Name? Dara\nHi Dara\n');
    expect(within(output()).getByText('Dara').className).toBe('run-in');
  });

  it('says it is running, and Stop gives the panel back without waiting', async () => {
    let finish: (v: unknown) => void = () => {};
    runCodeAction.mockReturnValue(new Promise((r) => (finish = r)));
    render(<RunPanel language="python" files={pyFiles} onGoTo={vi.fn()} />);
    run();
    expect(screen.getByText('Running…')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Stop' }));
    expect(screen.getByRole('button', { name: 'Run' })).toBeTruthy();
    expect(output().textContent).toMatch(/Stopped/);
    await act(async () => finish(result({ stdout: 'late\n' })));
    expect(output().textContent).not.toContain('late'); // the stopped run's output is ignored
  });

  it('shows a Java compile error with a link to its file and line, and which class it ran', async () => {
    const onGoTo = vi.fn();
    runCodeAction.mockResolvedValue(
      result({
        status: 'compile_error',
        exitCode: 1,
        mainClass: 'com.club.Main',
        stderr: "src/com/club/Main.java:9: error: ';' expected\n1 error\n",
      }),
    );
    const files = [{ path: 'src/com/club/Main.java', content: 'x' }];
    render(<RunPanel language="java" files={files} onGoTo={onGoTo} />);
    run();
    expect(await screen.findByText('Didn’t compile')).toBeTruthy();
    expect(screen.getByText(/runs com\.club\.Main/)).toBeTruthy();
    expect(within(output()).getByText(/';' expected/).className).toBe('run-err');
    fireEvent.click(screen.getByRole('button', { name: 'Go to line 9 of Main.java' }));
    expect(onGoTo).toHaveBeenCalledWith('src/com/club/Main.java', 9);
  });

  it('explains running out of input, the time limit and a busy runner in plain words', async () => {
    render(<RunPanel language="python" files={pyFiles} onGoTo={vi.fn()} />);
    runCodeAction.mockResolvedValueOnce(result({ status: 'timeout', exitCode: null }));
    run();
    expect(await screen.findByText(/longer than 10 seconds/)).toBeTruthy();
    runCodeAction.mockResolvedValueOnce(result({ status: 'busy', exitCode: null }));
    run();
    expect(await screen.findByText(/Run is busy/)).toBeTruthy();
    runCodeAction.mockResolvedValueOnce(result({ status: 'already_running', exitCode: null }));
    run();
    expect(await screen.findByText(/You already have a program running/)).toBeTruthy();
    runCodeAction.mockResolvedValueOnce({ ok: false, error: "That's 20 runs a minute, the most allowed." });
    run();
    expect((await screen.findByRole('alert')).textContent).toMatch(/20 runs a minute/);
  });

  it('says before running that a program reading input needs the Input box filled', () => {
    render(<RunPanel language="python" files={pyFiles} onGoTo={vi.fn()} />);
    expect(screen.getByText(/uses input\(\): type its answers here/)).toBeTruthy();
    fireEvent.change(screen.getByLabelText(/^Input/), { target: { value: 'Dara' } });
    expect(screen.queryByText(/uses input\(\)/)).toBeNull();
  });

  it('when the program wants more input than the box has, asks for it there instead of showing an error', async () => {
    runCodeAction.mockResolvedValue(result({ status: 'needs_input', exitCode: 75, stdout: 'Name? ' }));
    render(<RunPanel language="python" files={pyFiles} onGoTo={vi.fn()} />);
    run();
    expect(await screen.findByText('Waiting for input')).toBeTruthy();
    expect(output().textContent).toBe('Name? ');
    expect(screen.getByText(/Type what your program should read in the Input box/)).toBeTruthy();
    const box = screen.getByLabelText(/^Input/);
    expect(box.getAttribute('aria-invalid')).toBe('true');
    expect(document.activeElement).toBe(box);
  });
});
