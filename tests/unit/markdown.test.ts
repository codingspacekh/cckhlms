// NFR-05 · FR-TCH-01: lesson notes and Q&A are Markdown rendered on the server. Whatever a teacher or
// student types, the HTML that comes out must contain nothing that can run.
import { describe, expect, it } from 'vitest';
import { renderMarkdown } from '@/lib/markdown';
import { problems, XSS_CORPUS } from './markdown-safety';

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
