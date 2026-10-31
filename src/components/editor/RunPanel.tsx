'use client';
// The Run panel (M11, FR-CODE-09/10, prototype boards 1–2): beside the code for Python and Java. Students type the
// program's input first (owner's choice: no interactive terminal); the lines Python's input() read show in green,
// errors in pink, and an error in one of the project's files links to its line. Nothing about a run is saved.
import { useEffect, useRef, useState } from 'react';
import { Icon } from '@/components/ui/Icon';
import type { ProjectFile } from '@/lib/project/files';
import { errorPlace, outputParts } from '@/lib/run-output';
import { runCodeAction } from '@/modules/running/actions';
import type { RunResult } from '@/server/runner';

type Language = 'python' | 'java';
type Props = { language: Language; files: ProjectFile[]; onGoTo: (path: string, line: number) => void };

const VERSION: Record<Language, string> = { python: 'Python 3.12', java: 'Java 21' };
const INPUT_HINT: Record<Language, string> = { python: 'one line for each input()', java: 'what Scanner reads' };
// A program that reads input, by what it calls: said before running, while the Input box is empty.
const READS: Record<Language, { test: RegExp; what: string }> = {
  python: { test: /\binput\s*\(/, what: 'uses input()' },
  java: { test: /\bScanner\b|System\.in\b/, what: 'reads with Scanner' },
};
const seconds = (ms: number) => `${(ms / 1000).toFixed(1)} s`;

// The line under the buttons: how the run ended.
function ending(r: RunResult): { text: string; tone: 'good-text' | 'bad-text' | 'muted' } {
  switch (r.status) {
    case 'ok':
      return { text: `Finished in ${seconds(r.ms)}`, tone: 'good-text' };
    case 'compile_error':
      return { text: 'Didn’t compile', tone: 'bad-text' };
    case 'error':
      return { text: 'Stopped with an error', tone: 'bad-text' };
    case 'timeout':
      return { text: 'Stopped: it ran longer than 10 seconds', tone: 'bad-text' };
    case 'output_limit':
      return { text: 'Stopped: it printed too much (more than 64 KB)', tone: 'bad-text' };
    case 'needs_input':
      return { text: 'Waiting for input', tone: 'muted' };
    case 'busy':
      return { text: 'Run is busy: every place is in use. Try again in a moment.', tone: 'muted' };
    case 'already_running':
      return { text: 'You already have a program running. Wait for it to finish, then run again.', tone: 'muted' };
    default:
      return { text: 'Run isn’t available right now. Your work is still saved.', tone: 'muted' };
  }
}

// A plain-words hint for the mistakes beginners make most.
function hint(r: RunResult): string | null {
  if (r.status === 'needs_input')
    return 'Your program is asking for input. Type what your program should read in the Input box, one line for each answer, then press Run again.';
  if (r.status === 'timeout') return 'Is there a loop that never ends? Check its condition changes each time round.';
  return null;
}

export function RunPanel({ language, files, onGoTo }: Props) {
  const [stdin, setStdin] = useState('');
  const [running, setRunning] = useState(false);
  const [stopped, setStopped] = useState(false);
  const [result, setResult] = useState<RunResult | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const attempt = useRef(0); // a run that was stopped (or overtaken) is ignored when it finishes
  const inputBox = useRef<HTMLTextAreaElement>(null);
  const needsInput = !running && result?.status === 'needs_input';
  const reads = READS[language];
  const readsInput = stdin.trim() === '' && files.some((f) => reads.test.test(f.content));
  useEffect(() => {
    if (needsInput) inputBox.current?.focus();
  }, [needsInput, result]);

  async function run() {
    const mine = ++attempt.current;
    setRunning(true);
    setStopped(false);
    setProblem(null);
    const input = stdin === '' || stdin.endsWith('\n') ? stdin : `${stdin}\n`; // the last line is read too
    const r = await runCodeAction({ language, files, stdin: input });
    if (mine !== attempt.current) return;
    setRunning(false);
    if (r.ok && r.data) setResult(r.data);
    else if (!r.ok) setProblem(r.error);
  }
  function stop() {
    attempt.current++;
    setRunning(false);
    setStopped(true);
    setResult(null);
  }

  const end = result && !running ? ending(result) : null;
  const place =
    result && !running
      ? errorPlace(
          result.stderr,
          files.map((f) => f.path),
        )
      : null;
  const tip = result && !running ? hint(result) : null;

  return (
    <section className="run-panel" aria-labelledby="run-title">
      <div className="spread">
        <h3 id="run-title">Run</h3>
        <span className="xs muted">
          {VERSION[language]}
          {language === 'java' && result?.mainClass ? ` · runs ${result.mainClass}` : ''}
        </span>
      </div>
      <label className="f">
        <span>
          Input <span className="xs muted">· {INPUT_HINT[language]}</span>
        </span>
        <textarea
          ref={inputBox}
          aria-invalid={needsInput || undefined}
          aria-describedby={readsInput ? 'run-reads' : undefined}
          className="run-input"
          rows={3}
          value={stdin}
          maxLength={10 * 1024}
          spellCheck={false}
          onChange={(e) => setStdin(e.target.value)}
        />
      </label>
      {readsInput && !needsInput && (
        <p id="run-reads" className="xs muted">
          Your program {reads.what}: type its answers here first, one per line.
        </p>
      )}
      <div className="row">
        {running ? (
          <>
            <button type="button" className="btn" onClick={stop}>
              Stop
            </button>
            <span className="small" role="status">
              Running…
            </span>
          </>
        ) : (
          <>
            <button type="button" className="btn run" onClick={run}>
              <Icon name="play" /> Run
            </button>
            {end && (
              <span className={`small strong ${end.tone}`} role="status">
                {end.text}
              </span>
            )}
          </>
        )}
      </div>
      {problem && (
        <p className="note bad" role="alert">
          {problem}
        </p>
      )}
      <div className="run-out" role="log" aria-label="Output" aria-live="polite">
        {running ? (
          <span className="run-muted">Starting {language === 'python' ? 'Python' : 'Java'}…</span>
        ) : stopped ? (
          <span className="run-muted">Stopped. Press Run to try again.</span>
        ) : !result ? (
          <span className="run-muted">Press Run to see what your program prints.</span>
        ) : (
          <>
            {outputParts(result.stdout).map((p, i) =>
              p.input ? (
                <span key={i} className="run-in">
                  {p.text}
                </span>
              ) : (
                p.text
              ),
            )}
            {result.stderr && <span className="run-err">{result.stderr}</span>}
            {result.truncated && <span className="run-muted">{'\n'}… (the rest was left out)</span>}
          </>
        )}
      </div>
      {(place || tip) && (
        <div className={`run-hint${needsInput ? ' ask' : ''}`}>
          {tip && <p className="small">{tip}</p>}
          {place && (
            <button type="button" className="btn sm" onClick={() => onGoTo(place.path, place.line)}>
              Go to line {place.line} of {place.path.split('/').pop()}
            </button>
          )}
        </div>
      )}
      <p className="xs muted">The lines from the Input box show in green, where the program read them. A run stops after 10 seconds.</p>
    </section>
  );
}
