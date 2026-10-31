// Code colours for lesson notes (FR-STU-12), worked out with the CodeMirror language parsers the editor already
// uses, so a note's code is coloured the same on the server and in the browser. Returns plain text runs with
// lezer's tok-* class names; whoever turns them into HTML escapes the text.
import { cssLanguage } from '@codemirror/lang-css';
import { htmlLanguage } from '@codemirror/lang-html';
import { javaLanguage } from '@codemirror/lang-java';
import { javascriptLanguage } from '@codemirror/lang-javascript';
import { pythonLanguage } from '@codemirror/lang-python';
import type { LRLanguage } from '@codemirror/language';
import { classHighlighter, highlightCode } from '@lezer/highlight';

const LANGUAGES: Record<string, { label: string; language: LRLanguage }> = {
  python: { label: 'Python', language: pythonLanguage },
  java: { label: 'Java', language: javaLanguage },
  html: { label: 'HTML', language: htmlLanguage },
  css: { label: 'CSS', language: cssLanguage },
  javascript: { label: 'JavaScript', language: javascriptLanguage },
};
const ALIASES: Record<string, string> = { py: 'python', js: 'javascript' };

// The languages a teacher can pick for a code block, in menu order.
export const CODE_LANGUAGES = Object.entries(LANGUAGES).map(([id, l]) => ({ id, label: l.label }));

export function codeLanguage(word: string): { id: string; label: string } | null {
  const id = ALIASES[word.toLowerCase()] ?? word.toLowerCase();
  const l = LANGUAGES[id];
  return l ? { id, label: l.label } : null;
}

export type Run = { text: string; cls: string };

// Lines with no colour: a language the app doesn't know, or code past a post's colouring budget (markdown.ts).
export function plainLines(code: string): Run[][] {
  return code.split('\n').map((text) => (text ? [{ text, cls: '' }] : []));
}

// One array of runs per line. A language the app doesn't know comes back as uncoloured lines.
export function highlightLines(code: string, lang: string): Run[][] {
  const known = codeLanguage(lang);
  if (!known) return plainLines(code);
  const lines: Run[][] = [[]];
  const { language } = LANGUAGES[known.id]!;
  highlightCode(
    code,
    language.parser.parse(code),
    classHighlighter,
    (text, cls) => lines.at(-1)!.push({ text, cls }),
    () => lines.push([]),
  );
  return lines;
}
