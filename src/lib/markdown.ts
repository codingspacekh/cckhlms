// Markdown for lesson notes and Q&A (FR-TCH-01, FR-STU-03, NFR-05). Rendered on the server; raw HTML is
// shown as text, and links and images are limited to an allowlist, so the output can't run anything.
// tests/unit/markdown.test.ts checks this against an XSS corpus.
import MarkdownIt from 'markdown-it';

const md = new MarkdownIt('default', { html: false, linkify: true, breaks: true });
const { escapeHtml } = md.utils;

const isWeb = (url: string) => /^https?:\/\//i.test(url);
const isLocal = (url: string) => url.startsWith('/') && !url.startsWith('//');

// Only web, email and same-site links. Everything else (javascript:, data:, //host …) stays plain text.
md.validateLink = (url) => isWeb(url) || /^mailto:/i.test(url) || isLocal(url) || url.startsWith('#');

// The page title is the only h1, so a note's headings start at h2 and the levels it uses close up
// (## then #### becomes h2 then h3), keeping the page outline without gaps.
md.core.ruler.push('heading_levels', (state) => {
  const headings = state.tokens.filter((t) => t.type === 'heading_open' || t.type === 'heading_close');
  const levels = [...new Set(headings.map((t) => Number(t.tag.slice(1))))].sort((a, b) => a - b);
  for (const t of headings) t.tag = `h${Math.min(6, levels.indexOf(Number(t.tag.slice(1))) + 2)}`;
});

const webLinkAttrs = ' target="_blank" rel="noopener noreferrer nofollow"';

md.renderer.rules.link_open = (tokens, idx, options, _env, self) => {
  const t = tokens[idx]!;
  if (isWeb(String(t.attrGet('href') ?? ''))) {
    t.attrSet('target', '_blank');
    t.attrSet('rel', 'noopener noreferrer nofollow');
  }
  return self.renderToken(tokens, idx, options);
};

// Images only from the LMS itself (the CSP blocks others anyway); a web image becomes a link to it.
const defaultImage = md.renderer.rules.image!;
md.renderer.rules.image = (tokens, idx, options, env, self) => {
  const t = tokens[idx]!;
  const src = String(t.attrGet('src') ?? '');
  if (isLocal(src)) return defaultImage(tokens, idx, options, env, self);
  const alt = self.renderInlineAsText(t.children ?? [], options, env) || src;
  return `<a href="${escapeHtml(src)}"${webLinkAttrs}>${escapeHtml(alt)}</a>`;
};

// Code blocks keep their text exactly; the language label is used only if it's a plain word.
md.renderer.rules.fence = (tokens, idx) => {
  const t = tokens[idx]!;
  const lang = t.info.trim().split(/\s+/)[0] ?? '';
  const cls = /^[\w+#-]+$/.test(lang) ? ` class="language-${lang}"` : '';
  return `<pre><code${cls}>${escapeHtml(t.content)}</code></pre>\n`;
};

export function renderMarkdown(source: string): string {
  return source.trim() ? md.render(source) : '';
}
