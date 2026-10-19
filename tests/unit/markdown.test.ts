// NFR-05 · FR-TCH-01: lesson notes and Q&A are Markdown rendered on the server. Whatever a teacher or
// student types, the HTML that comes out must contain nothing that can run.
import { JSDOM } from 'jsdom';
import { describe, expect, it } from 'vitest';
import { renderMarkdown } from '@/lib/markdown';

const ALLOWED_TAGS = new Set([
  'p', 'h2', 'h3', 'h4', 'h5', 'h6', 'strong', 'em', 's', 'code', 'pre', 'blockquote', 'ul', 'ol', 'li', 'a', 'img',
  'hr', 'br', 'table', 'thead', 'tbody', 'tr', 'th', 'td',
]); // prettier-ignore
const SAFE_URL = /^(https?:\/\/|mailto:|\/(?!\/)|#)/i;

// Parses the output and fails on anything outside a small allowlist of tags, attributes and URL schemes.
function problems(html: string): string[] {
  const doc = new JSDOM(`<body>${html}</body>`).window.document;
  const out: string[] = [];
  for (const el of doc.body.querySelectorAll('*')) {
    const tag = el.tagName.toLowerCase();
    if (!ALLOWED_TAGS.has(tag)) out.push(`tag <${tag}>`);
    for (const { name, value } of el.attributes) {
      if (name === 'href' || name === 'src') {
        if (!SAFE_URL.test(value)) out.push(`${tag} ${name}="${value}"`);
        if (tag === 'img' && !value.startsWith('/')) out.push(`external image ${value}`);
      } else if (name === 'class') {
        if (!/^language-[\w+#-]+$/.test(value)) out.push(`class="${value}"`);
      } else if (name === 'style') {
        if (!/^text-align:(left|right|center)$/.test(value)) out.push(`style="${value}"`);
      } else if (!['alt', 'title', 'rel', 'target', 'start'].includes(name)) out.push(`attribute ${name} on <${tag}>`);
    }
  }
  return out;
}

const XSS_CORPUS = [
  '<script>alert(1)</script>',
  '<img src=x onerror=alert(1)>',
  '<svg onload=alert(1)>',
  '<iframe src="https://evil.example"></iframe>',
  '<a href="javascript:alert(1)">click</a>',
  '<style>body{display:none}</style>',
  '<object data="x.swf"></object>',
  '<!-- <script>alert(1)</script> -->',
  '<details open ontoggle=alert(1)>',
  '[click](javascript:alert(1))',
  '[click](JaVaScRiPt:alert(1))',
  '[click](  javascript:alert(1))',
  '[click](&#106;avascript:alert(1))',
  '[click](&#x6A;avascript&colon;alert(1))',
  '[click](java\tscript:alert(1))',
  '[click](vbscript:msgbox(1))',
  '[click](data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg==)',
  '[click](//evil.example/x)',
  '[click](https://example.com" onmouseover="alert(1))',
  '[click](https://example.com \'x" onmouseover="alert(1)\')',
  '[click][1]\n\n[1]: javascript:alert(1)',
  '<javascript:alert(1)>',
  'javascript:alert(1)',
  '![x](javascript:alert(1))',
  '![x](https://evil.example/track.png)',
  '![x](data:image/svg+xml;base64,PHN2ZyBvbmxvYWQ9YWxlcnQoMSk+)',
  '```"><img src=x onerror=alert(1)>\ncode\n```',
  '```python onclick=alert(1)\nprint(1)\n```',
  '| a | b |\n|:-|-:|\n| <b onclick=alert(1)>x</b> | y |',
  '<<script>script>alert(1)<</script>/script>',
  '`<script>alert(1)</script>`',
  '> <img src=x onerror=alert(1)>',
  '- [x](javascript:alert(1))\n- <img src=x onerror=alert(1)>',
];

describe('renderMarkdown: XSS corpus', () => {
  for (const input of XSS_CORPUS) {
    it(`outputs nothing executable for ${JSON.stringify(input).slice(0, 60)}`, () => {
      expect(problems(renderMarkdown(input))).toEqual([]);
    });
  }

  it('shows raw HTML as text instead of dropping it', () => {
    expect(renderMarkdown('<b>hi</b>')).toBe('<p>&lt;b&gt;hi&lt;/b&gt;</p>\n');
  });
});

describe('renderMarkdown: what teachers write', () => {
  it('renders emphasis, lists and inline code', () => {
    const html = renderMarkdown('We used **for loops**.\n\n- `range(5)` gives 0 to 4\n- indent the body');
    expect(html).toContain('<strong>for loops</strong>');
    expect(html).toContain('<li><code>range(5)</code> gives 0 to 4</li>');
  });

  it('keeps code blocks exactly, with a language class', () => {
    const html = renderMarkdown('```python\nfor i in range(5):\n    print("Lap", i + 1)\n```');
    expect(html).toBe('<pre><code class="language-python">for i in range(5):\n    print(&quot;Lap&quot;, i + 1)\n</code></pre>\n');
  });

  it('starts headings at h2 with no skipped levels, because the page title is the only h1', () => {
    expect(renderMarkdown('# Today\n## Try at home')).toBe('<h2>Today</h2>\n<h3>Try at home</h3>\n');
    expect(renderMarkdown('## What we did\n#### Detail\n## Next')).toBe('<h2>What we did</h2>\n<h3>Detail</h3>\n<h2>Next</h2>\n');
    expect(renderMarkdown('### Only one')).toBe('<h2>Only one</h2>\n');
  });

  it('opens web links in a new tab without giving the other site access to the LMS', () => {
    expect(renderMarkdown('[Docs](https://docs.python.org/3/)')).toBe(
      '<p><a href="https://docs.python.org/3/" target="_blank" rel="noopener noreferrer nofollow">Docs</a></p>\n',
    );
    expect(renderMarkdown('See https://example.com')).toContain('href="https://example.com"');
  });

  it('keeps links to LMS pages in the same tab', () => {
    expect(renderMarkdown('[Week 2](/student/classes/abc/weeks/2)')).toBe('<p><a href="/student/classes/abc/weeks/2">Week 2</a></p>\n');
  });

  it('shows an unsafe link as plain text', () => {
    expect(renderMarkdown('[click](javascript:alert(1))')).toBe('<p>[click](javascript:alert(1))</p>\n');
  });

  it('shows images stored in the LMS, and turns other images into links', () => {
    expect(renderMarkdown('![Loop diagram](/files/abc)')).toBe('<p><img src="/files/abc" alt="Loop diagram"></p>\n');
    expect(renderMarkdown('![Logo](https://example.com/logo.png)')).toBe(
      '<p><a href="https://example.com/logo.png" target="_blank" rel="noopener noreferrer nofollow">Logo</a></p>\n',
    );
  });

  it('renders tables', () => {
    expect(renderMarkdown('| a | b |\n|---|--:|\n| 1 | 2 |')).toContain('<td style="text-align:right">2</td>');
  });

  it('returns an empty string for empty input', () => {
    expect(renderMarkdown('')).toBe('');
    expect(renderMarkdown('   \n')).toBe('');
  });
});
