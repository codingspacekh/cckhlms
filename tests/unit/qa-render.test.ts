// M12 · BR-26: questions and replies are Markdown from the compact editor. They show code blocks as the lesson note
// does (colours, the language, Copy), but no pictures, tip boxes or raw HTML.
import { describe, expect, it } from 'vitest';
import { renderPost } from '@/lib/markdown';
import { problems, XSS_CORPUS, type Allowlist } from './markdown-safety';

// The code blocks' markup is all a post adds to plain Markdown: no figures, no tip boxes.
const POST: Allowlist = {
  tags: ['div', 'span', 'button'],
  classes: /^(code-block|code-head|code-lang|code-copy|line|tok-[a-zA-Z]+( tok-[a-zA-Z]+)*)$/,
  attributes: ['type="button"'],
};

describe('renderPost: XSS corpus', () => {
  const CORPUS = [
    ...XSS_CORPUS,
    '![x" onerror="alert(1)](/api/files/abc#medium)',
    '```python\n</code></pre><script>alert(1)</script>\n```',
    '```html\n<script>alert(1)</script>\n<img src=x onerror=alert(1)>\n```',
    '```<script>\nx\n```',
  ];
  for (const input of CORPUS) {
    it(`outputs nothing executable for ${JSON.stringify(input).slice(0, 60)}`, () => {
      expect(problems(renderPost(input), POST)).toEqual([]);
    });
  }
});

describe('renderPost', () => {
  it('shows a code block with its language, colours and a Copy button', () => {
    const html = renderPost('Why does this print 0?\n\n```python\nfor i in range(5):\n    print(i)\n```');
    expect(html).toContain('<p>Why does this print 0?</p>');
    expect(html).toContain('<div class="code-block"><div class="code-head"><span class="code-lang">Python</span>');
    expect(html).toContain('<button type="button" class="code-copy">Copy</button>');
    expect(html).toMatch(/<span class="tok-keyword">for<\/span>/);
  });

  it('keeps code in a sentence, bold, lists and links', () => {
    const html = renderPost('Use `range(1, 6)`, **not** `range(5)`:\n\n- one\n- two\n\nSee [the docs](https://docs.python.org/3/).');
    expect(html).toContain('<code>range(1, 6)</code>');
    expect(html).toContain('<strong>not</strong>');
    expect(html).toContain('<li>one</li>');
    expect(html).toContain('<a href="https://docs.python.org/3/" target="_blank" rel="noopener noreferrer nofollow">the docs</a>');
  });

  it('shows no pictures, not even uploaded ones, and no tip boxes', () => {
    const html = renderPost('![cat](/api/files/abc#medium)\n\n> [!TIP]\n> a tip');
    expect(html).not.toContain('<img');
    expect(html).toContain('<a href="/api/files/abc#medium">cat</a>');
    expect(html).not.toContain('tip-box');
    expect(html).toContain('<blockquote>');
  });

  it('keeps raw HTML and scripts as text, in code blocks too', () => {
    const html = renderPost('<script>alert(1)</script>\n\n```html\n<script>alert(2)</script>\n```\n\n[x](javascript:alert(3))');
    expect(html).not.toMatch(/<script/i);
    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
    expect(html).not.toContain('href="javascript:');
  });
});

describe('renderPost: bounded colouring (M17b, F07)', () => {
  it('colours at most 2,000 characters of code in one post; the rest shows as plain lines', () => {
    const block = Array.from({ length: 60 }, (_, i) => `print(${i})  # line ${String(i).padStart(4, '0')}`).join('\n');
    expect(block.length).toBeGreaterThan(1200);
    const html = renderPost('```python\n' + block + '\n```\n\n```python\n' + block + '\n```');
    const [first, second] = html.split('<div class="code-block">').slice(1);
    expect(first).toMatch(/<span class="tok-/);
    expect(second).not.toMatch(/<span class="tok-/);
    expect(second!.match(/<span class="line">/g)).toHaveLength(60); // still one numbered line each
    expect(second).toContain('print(59)');
  });

  it('an html block of repeated unclosed tags, at the 8,000-character limit, renders quickly', () => {
    const started = performance.now();
    renderPost('```html\n' + '<a'.repeat(3993) + '\n```');
    expect(performance.now() - started).toBeLessThan(150);
  });
});
