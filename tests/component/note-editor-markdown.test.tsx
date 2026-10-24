// FR-TCH-22 · BR-22 (M9): the lesson note editor still saves Markdown, and opening a note in it and saving again
// never changes what students see: renderNote gives the same HTML before and after, for every note written so far
// (the dev seed's and the tests') and every kind of block.
import { Editor } from '@tiptap/core';
import { afterAll, describe, expect, it } from 'vitest';
import { noteExtensions, tidyMarkdown } from '@/components/teaching/note-editor/extensions';
import { renderNote } from '@/lib/markdown';

const editor = new Editor({ extensions: noteExtensions() });
afterAll(() => editor.destroy());
const roundTrip = (md: string) => {
  editor.commands.setContent(md, { contentType: 'markdown' });
  return tidyMarkdown(editor.getMarkdown());
};

// Notes as teachers wrote them before M9: the dev seed (scripts/seed-dev.ts) and the e2e tests.
const WRITTEN_BEFORE = [
  'We wrote our first programs.\n\n```python\nprint("Hello, club!")\n```',
  'Programs can choose what to do.\n\n```python\nif age >= 12:\n    print("Welcome")\n```',
  '## What we did today\nWe used **for loops** to repeat code without copying it.\n\n- `range(5)` gives the numbers 0, 1, 2, 3, 4\n- the code inside the loop must be **indented**\n\n```python\nfor i in range(5):\n    print("Lap", i + 1)\n```\n\n> [!TIP]\n> `range(10, 0, -1)` counts down and stops before 0.\n\n## Try at home\nChange the program so it counts **down** from 10 to 1, then prints "Lift off!".',
  'Draft: plan the guessing game.',
  'A **variable** is a name for a value.',
  '## What we did\nWe used **for loops**.\n\n```python\nfor i in range(5):\n    print("Lap", i + 1)\n```\n\n<img src=x onerror=alert(1)>',
  'Coming soon',
  'See the diagram:\n\n![diagram.png](/api/files/abc)',
];

// Every kind of block and mark the reading view knows.
const EVERY_KIND = {
  headings: '# Big\n\n## Medium\n\n### Small\n\n#### Smaller',
  marks: 'Some **bold**, *italic*, `code`, ~~gone~~ and ***both***.',
  links: '[Docs](https://docs.python.org/3/), [Week 2](/student/classes/abc/weeks/2), <https://example.com> and https://example.org',
  'line breaks': 'line one\nline two\nline three',
  'bullet list': '- one\n- two\n  - two and a half\n- three',
  'numbered list': '1. first\n2. second\n3. third',
  'numbered list from 4': '4. four\n5. five',
  'list with code': '- run this:\n\n  ```python\n  print(1)\n  ```\n- then this',
  'code blocks':
    '```java\nclass A {\n    int x = 1;\n}\n```\n\n```html\n<p class="a">Hi</p>\n```\n\n```\nno language\n```\n\n```scratch\nwhen flag clicked\n```',
  'code with blank lines and tabs': '```python\ndef f():\n\treturn 1\n\n\nprint(f())\n```',
  'code with backticks': '````markdown\n```python\nprint(1)\n```\n````',
  'tip on the next line': '> [!TIP]\n> Indent with **four** spaces.',
  'tip on the same line': '> [!TIP] Indent with four spaces.',
  'tip with two paragraphs': '> [!TIP]\n> First.\n>\n> Second, with `code`.',
  'tip with only the marker on its first line, then a paragraph': '> [!TIP]\n>\n> On its own.',
  'tip with a line break': '> [!TIP]\n> First line\n> second line',
  'empty code block': '```python\n```',
  'loose numbered list': '1. one\n\n2. two',
  quote: '> Programs must be written for people to read.',
  pictures: '![Small](/api/files/a#small)\n\n![Medium](/api/files/b#medium)\n\n![Full](/api/files/c#full)\n\n![](/api/files/d)',
  'picture in a sentence': 'Press ![the run button](/api/files/run#small) to start.',
  'web picture': '![Logo](https://example.com/logo.png)',
  table: '| a | b |\n|:--|--:|\n| 1 | 2 |\n| `x` | **y** |',
  rule: 'Before\n\n---\n\nAfter',
  'escaped characters': 'Use \\* and \\_ and \\# and 2 \\< 3 & 4 > 1',
  'raw HTML is text': 'The <p> tag, <b>bold</b> and <script>alert(1)</script>.\n\n<div>\nblock\n</div>',
  'Khmer text': 'សួស្តី **កូដ**',
};

describe('the note editor keeps Markdown', () => {
  it.each(WRITTEN_BEFORE.map((md) => [md.slice(0, 40), md]))('a note written before M9 reads the same after saving: %s', (_, md) => {
    expect(renderNote(roundTrip(md))).toBe(renderNote(md));
  });

  it.each(Object.entries(EVERY_KIND))('%s read the same after saving', (_, md) => {
    expect(renderNote(roundTrip(md))).toBe(renderNote(md));
  });

  it.each(Object.entries(EVERY_KIND))('%s: saving twice changes nothing more', (_, md) => {
    const once = roundTrip(md);
    expect(roundTrip(once)).toBe(once);
  });

  it('writes a tip box as > [!TIP]', () => {
    expect(roundTrip('> [!TIP]\n> Indent with **four** spaces.')).toBe('> [!TIP]\n> Indent with **four** spaces.');
  });

  it('writes the code block language after the fence', () => {
    expect(roundTrip('```java\nclass A {}\n```')).toBe('```java\nclass A {}\n```');
  });

  it('keeps pictures from the LMS when pasting, and drops pictures from other websites', () => {
    editor.commands.setContent('<p>a<img src="https://evil.example/x.png" alt="web">b<img src="/api/files/abc#small" alt="ours"></p>');
    expect(tidyMarkdown(editor.getMarkdown())).toBe('ab![ours](/api/files/abc#small)');
  });

  it('turns a pasted underline into plain text, since Markdown has none', () => {
    editor.commands.setContent('<p><u>under</u>line</p>');
    expect(tidyMarkdown(editor.getMarkdown())).toBe('underline');
  });
});
