// FR-STU-12 · BR-22 · NFR-05 (M9): a lesson note reads like a book page. Code blocks get a language label, colours,
// line numbers and a Copy button; `> [!TIP]` becomes a tip box; a picture on its own line becomes a figure with its
// caption and size. It is still Markdown rendered on the server, so the XSS corpus must stay harmless.
import { JSDOM } from 'jsdom';
import { describe, expect, it } from 'vitest';
import { renderNote } from '@/lib/markdown';
import { problems, XSS_CORPUS, type Allowlist } from './markdown-safety';

const NOTE: Allowlist = {
  tags: ['div', 'span', 'button', 'figure', 'figcaption'],
  classes: /^(code-block|code-head|code-lang|code-copy|line|tip-box|pic|pic pic-(small|medium|full)|tok-[a-zA-Z]+( tok-[a-zA-Z]+)*)$/,
  attributes: ['type="button"', 'role="note"'],
};
const dom = (html: string) => new JSDOM(`<body>${html}</body>`).window.document.body;

describe('renderNote: XSS corpus', () => {
  const NOTE_CORPUS = [
    ...XSS_CORPUS,
    '> [!TIP] <img src=x onerror=alert(1)>',
    '> [!TIP]\n> [x](javascript:alert(1))',
    '![<script>alert(1)</script>](/api/files/abc#small)',
    '![x" onerror="alert(1)](/api/files/abc#medium)',
    '![x](/api/files/abc#full" onerror="alert(1))',
    '![x](javascript:alert(1)#small)',
    '```python\n</code></pre><script>alert(1)</script>\n```',
    '```html\n<script>alert(1)</script>\n<img src=x onerror=alert(1)>\n```',
    '```<script>\nx\n```',
  ];
  for (const input of NOTE_CORPUS) {
    it(`outputs nothing executable for ${JSON.stringify(input).slice(0, 60)}`, () => {
      expect(problems(renderNote(input), NOTE)).toEqual([]);
    });
  }
});

describe('renderNote: code blocks', () => {
  const SOURCE = 'for i in range(10, 0, -1):\n    print(i)  # count down\nprint("Lift off!")';
  const block = () => dom(renderNote('```python\n' + SOURCE + '\n```')).querySelector('.code-block')!;

  it('keeps the code exactly, one line per line', () => {
    const code = block().querySelector('pre > code.language-python')!;
    expect(code.textContent).toBe(SOURCE);
    expect([...code.querySelectorAll(':scope > .line')].map((l) => l.textContent)).toEqual(SOURCE.split('\n'));
  });

  it('labels the language and has a Copy button', () => {
    expect(block().querySelector('.code-head .code-lang')!.textContent).toBe('Python');
    const copy = block().querySelector('button.code-copy')!;
    expect(copy.getAttribute('type')).toBe('button');
    expect(copy.textContent).toBe('Copy');
  });

  it('colours keywords, strings, numbers and comments', () => {
    const tok = (cls: string) => [...block().querySelectorAll(`.${cls}`)].map((t) => t.textContent);
    expect(tok('tok-keyword')).toEqual(['for', 'in']);
    expect(tok('tok-string')).toEqual(['"Lift off!"']);
    expect(tok('tok-number')).toEqual(['10', '0', '1']);
    expect(tok('tok-comment')).toEqual(['# count down']);
  });

  it.each([
    ['java', 'Java', 'class'],
    ['html', 'HTML', null],
    ['css', 'CSS', null],
    ['js', 'JavaScript', 'let'],
    ['javascript', 'JavaScript', 'let'],
    ['py', 'Python', 'def'],
  ])('knows %s as %s', (lang, label, keyword) => {
    const sample = {
      java: 'class A {}',
      html: '<p>Hi</p>',
      css: 'p { color: red; }',
      js: 'let x = 1',
      javascript: 'let x = 1',
      py: 'def f(): pass',
    }[lang]!;
    const b = dom(renderNote('```' + lang + '\n' + sample + '\n```')).querySelector('.code-block')!;
    expect(b.querySelector('.code-lang')!.textContent).toBe(label);
    expect(b.querySelector('code')!.textContent).toBe(sample);
    expect(b.querySelectorAll('[class^="tok-"]').length).toBeGreaterThan(0);
    if (keyword) expect(b.querySelector('.tok-keyword')!.textContent).toBe(keyword);
  });

  it('shows other languages as plain text with their name, and a block with none as Code', () => {
    const other = dom(renderNote('```scratch\nwhen flag clicked\n```')).querySelector('.code-block')!;
    expect(other.querySelector('.code-lang')!.textContent).toBe('scratch');
    expect(other.querySelectorAll('[class^="tok-"]')).toHaveLength(0);
    const none = dom(renderNote('```\n10 PRINT "HI"\n```')).querySelector('.code-block')!;
    expect(none.querySelector('.code-lang')!.textContent).toBe('Code');
    expect(none.querySelector('code')!.className).toBe('');
  });

  it('keeps code that looks like HTML as text', () => {
    const b = dom(renderNote('```html\n<script>alert(1)</script>\n```')).querySelector('.code-block')!;
    expect(b.querySelector('script')).toBeNull();
    expect(b.querySelector('code')!.textContent).toBe('<script>alert(1)</script>');
  });

  it('keeps blank lines inside the code', () => {
    const code = dom(renderNote('```python\na = 1\n\nb = 2\n```')).querySelector('code')!;
    expect(code.textContent).toBe('a = 1\n\nb = 2');
    expect(code.querySelectorAll('.line')).toHaveLength(3);
  });
});

describe('renderNote: tip boxes', () => {
  it('turns > [!TIP] into a tip box, on the same line or the next', () => {
    const tip = '<div class="tip-box" role="note">\n<p><strong>Tip:</strong> range(1, 11) stops before 11.</p>\n</div>\n';
    expect(renderNote('> [!TIP] range(1, 11) stops before 11.')).toBe(tip);
    expect(renderNote('> [!TIP]\n> range(1, 11) stops before 11.')).toBe(tip);
    expect(renderNote('> [!tip]\n> range(1, 11) stops before 11.')).toBe(tip);
  });

  it('keeps formatting inside the tip, and further paragraphs', () => {
    const html = renderNote('> [!TIP]\n> Use `range()` and **indent**.\n>\n> Then run it.');
    expect(html).toBe(
      '<div class="tip-box" role="note">\n<p><strong>Tip:</strong> Use <code>range()</code> and <strong>indent</strong>.</p>\n<p>Then run it.</p>\n</div>\n',
    );
  });

  it('leaves an ordinary quote as a quote', () => {
    expect(renderNote('> Programs must be written for people to read.')).toBe(
      '<blockquote>\n<p>Programs must be written for people to read.</p>\n</blockquote>\n',
    );
  });
});

describe('renderNote: pictures', () => {
  it('shows a picture on its own line as a figure with its caption and size', () => {
    expect(renderNote('![What you should see](/api/files/abc#medium)')).toBe(
      '<figure class="pic pic-medium"><img src="/api/files/abc" alt=""><figcaption>What you should see</figcaption></figure>\n',
    );
    expect(renderNote('![Small](/api/files/abc#small)')).toContain('<figure class="pic pic-small">');
    expect(renderNote('![Big](/api/files/abc#full)')).toContain('<figure class="pic pic-full">');
  });

  it('keeps pictures from before M9 at their own size, and drops an unknown size', () => {
    expect(renderNote('![Loop diagram](/api/files/abc)')).toBe(
      '<figure class="pic"><img src="/api/files/abc" alt=""><figcaption>Loop diagram</figcaption></figure>\n',
    );
    expect(renderNote('![x](/api/files/abc#huge)')).toContain('<figure class="pic"><img src="/api/files/abc" alt="">');
  });

  it('has no caption when the picture has no text', () => {
    expect(renderNote('![](/api/files/abc#small)')).toBe('<figure class="pic pic-small"><img src="/api/files/abc" alt=""></figure>\n');
  });

  it('escapes the caption', () => {
    const fig = dom(renderNote('![<b>bold</b> & "quoted"](/api/files/abc)')).querySelector('figcaption')!;
    expect(fig.textContent).toBe('<b>bold</b> & "quoted"');
    expect(fig.children).toHaveLength(0);
  });

  it('leaves a picture inside a sentence inline, and a web picture as a link', () => {
    expect(renderNote('Press ![the run button](/api/files/run#small) to start.')).toBe(
      '<p>Press <img src="/api/files/run" alt="the run button"> to start.</p>\n',
    );
    expect(renderNote('![Logo](https://example.com/logo.png)')).toBe(
      '<p><a href="https://example.com/logo.png" target="_blank" rel="noopener noreferrer nofollow">Logo</a></p>\n',
    );
  });
});

describe('renderNote: everything else is as before', () => {
  it('renders headings, emphasis, lists and links like renderMarkdown', () => {
    expect(renderNote('# Today\n\nWe used **for loops**.\n\n- [Docs](/student)')).toBe(
      '<h2>Today</h2>\n<p>We used <strong>for loops</strong>.</p>\n<ul>\n<li><a href="/student">Docs</a></li>\n</ul>\n',
    );
    expect(renderNote('')).toBe('');
  });
});
