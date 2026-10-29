// What the Run panel makes of a run's output (M11). The runner marks each line Python's input() read with \x1e…\x1f
// (infra/runner/runner.py), so it can be shown in green where the program read it, as in a terminal.
export type OutputPart = { text: string; input: boolean };

export function outputParts(stdout: string): OutputPart[] {
  const parts: OutputPart[] = [];
  const push = (text: string, input: boolean) => {
    if (!text) return;
    const last = parts.at(-1);
    if (last && last.input === input && !input) last.text += text;
    else parts.push({ text, input });
  };
  let rest = stdout;
  for (;;) {
    const start = rest.indexOf('\x1e');
    const end = start < 0 ? -1 : rest.indexOf('\x1f', start + 1);
    if (start < 0 || end < 0) break;
    push(rest.slice(0, start), false);
    push(rest.slice(start + 1, end), true);
    rest = rest.slice(end + 1);
  }
  push(rest, false);
  return parts;
}

// The file and line an error is about, if it is one of the project's files: the innermost project frame of a Python
// traceback, javac's first error, or the first project frame of a Java stack trace.
export function errorPlace(stderr: string, paths: string[]): { path: string; line: number } | null {
  const byPath = (p: string) => paths.find((x) => x === p) ?? null;
  const python = [...stderr.matchAll(/File "([^"]+)", line (\d+)/g)].map((m) => ({ path: byPath(m[1]!), line: Number(m[2]) }));
  const own = python.filter((p) => p.path).at(-1);
  if (own) return own as { path: string; line: number };
  const javac = stderr.match(/^(.+\.java):(\d+): error/m);
  if (javac) {
    const path = byPath(javac[1]!);
    return path ? { path, line: Number(javac[2]) } : null;
  }
  for (const m of stderr.matchAll(/\bat [\w.$]+\(([\w$]+\.java):(\d+)\)/g)) {
    const path = paths.find((p) => p === m[1] || p.endsWith(`/${m[1]}`));
    if (path) return { path, line: Number(m[2]) };
  }
  return null;
}
