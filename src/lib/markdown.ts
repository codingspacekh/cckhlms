// Markdown for lesson notes and Q&A (FR-TCH-01, FR-STU-03, NFR-05). Rendered on the server; raw HTML is
// shown as text, and links and images are limited to an allowlist, so the output can't run anything.
// tests/unit/markdown.test.ts and lesson-note.test.ts check this against an XSS corpus.
//
// renderNote adds the lesson note's reading view on top (FR-STU-12, BR-22): code blocks with a language label,
// colours, line numbers and a Copy button; `> [!TIP]` tip boxes; a picture on its own line as a captioned figure.
import MarkdownIt from 'markdown-it';
import type { Token } from 'markdown-it';
import { codeLanguage, highlightLines } from './code-highlight';

const md = new MarkdownIt('default', { html: false, linkify: true, breaks: true });
const { escapeHtml } = md.utils;

type NoteEnv = { note?: boolean };
const inNote = (env: unknown) => (env as NoteEnv | undefined)?.note === true;

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
  const alt = self.renderInlineAsText(t.children ?? [], options, env);
  if (!isLocal(src)) return `<a href="${escapeHtml(src)}"${webLinkAttrs}>${escapeHtml(alt || src)}</a>`;
  if (!inNote(env)) return defaultImage(tokens, idx, options, env, self);
  // In a note, `#small`, `#medium` or `#full` after the address is the picture's size (BR-22).
  const [path = '', size = ''] = src.split('#');
  if (!t.meta?.figure) {
    t.attrSet('src', path);
    return defaultImage(tokens, idx, options, env, self);
  }
  const cls = PICTURE_SIZES.has(size) ? `pic pic-${size}` : 'pic';
  // The caption is the picture's text for screen readers too, so the image itself has an empty alt.
  const caption = alt ? `<figcaption>${escapeHtml(alt)}</figcaption>` : '';
  return `<figure class="${cls}"><img src="${escapeHtml(path)}" alt="">${caption}</figure>\n`;
};
const PICTURE_SIZES = new Set(['small', 'medium', 'full']);

// Code blocks keep their text exactly; the language label is used only if it's a plain word.
md.renderer.rules.fence = (tokens, idx, _options, env) => {
  const t = tokens[idx]!;
  const lang = t.info.trim().split(/\s+/)[0] ?? '';
  const word = /^[\w+#-]+$/.test(lang) ? lang : '';
  const cls = word ? ` class="language-${word}"` : '';
  if (!inNote(env)) return `<pre><code${cls}>${escapeHtml(t.content)}</code></pre>\n`;
  // In a note: one span per line (numbered by CSS, so copying the code doesn't copy the numbers) and coloured runs.
  const lines = highlightLines(t.content.replace(/\n$/, ''), word)
    .map((runs) => {
      const text = runs.map((r) => (r.cls ? `<span class="${r.cls}">${escapeHtml(r.text)}</span>` : escapeHtml(r.text)));
      return `<span class="line">${text.join('')}</span>`;
    })
    .join('\n');
  const label = codeLanguage(word)?.label ?? (word || 'Code');
  return (
    `<div class="code-block"><div class="code-head"><span class="code-lang">${escapeHtml(label)}</span>` +
    `<button type="button" class="code-copy">Copy</button></div><pre><code${cls}>${lines}</code></pre></div>\n`
  );
};

// A note's `> [!TIP]` quote is a tip box, and a picture alone in a paragraph is a figure.
md.core.ruler.push('note_blocks', (state) => {
  if (!inNote(state.env)) return;
  const tokens = state.tokens;
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i]!;
    if (t.type === 'blockquote_open' && tokens[i + 2]?.type === 'inline' && tipMarker(tokens[i + 2]!, state.Token)) {
      t.tag = 'div';
      t.attrSet('class', 'tip-box');
      t.attrSet('role', 'note');
      const close = tokens.slice(i).find((x) => x.type === 'blockquote_close' && x.level === t.level)!;
      close.tag = 'div';
    }
    if (t.type === 'paragraph_open' && tokens[i + 2]?.type === 'paragraph_close') {
      const kids = tokens[i + 1]!.children ?? [];
      const img = kids.length === 1 ? kids[0]! : null;
      if (img?.type === 'image' && isLocal(String(img.attrGet('src') ?? ''))) {
        img.meta = { figure: true };
        t.hidden = true;
        tokens[i + 2]!.hidden = true;
      }
    }
  }
});

// Takes `[!TIP]` (and the line break after it) off the start of a quote and puts a bold "Tip:" there instead.
function tipMarker(inline: Token, T: typeof Token): boolean {
  const kids = inline.children ?? [];
  const first = kids[0];
  const m = first?.type === 'text' ? /^\[!tip\][ \t]*/i.exec(first.content) : null;
  if (!first || !m) return false;
  first.content = first.content.slice(m[0].length);
  if (!first.content && kids[1]?.type === 'softbreak') kids.splice(0, 2);
  else if (!first.content) kids.splice(0, 1);
  const bold = [
    new T('strong_open', 'strong', 1),
    Object.assign(new T('text', '', 0), { content: 'Tip:' }),
    new T('strong_close', 'strong', -1),
  ];
  kids.unshift(...bold, ...(kids.length ? [Object.assign(new T('text', '', 0), { content: ' ' })] : []));
  return true;
}

export function renderMarkdown(source: string): string {
  return source.trim() ? md.render(source) : '';
}

export function renderNote(source: string): string {
  return source.trim() ? md.render(source, { note: true } satisfies NoteEnv) : '';
}
