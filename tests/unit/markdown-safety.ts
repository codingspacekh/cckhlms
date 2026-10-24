// The safety check for rendered Markdown (NFR-05), shared by the plain renderer and the lesson note renderer:
// an XSS corpus, and a parser that fails on anything outside a small allowlist of tags, attributes and URLs.
import { JSDOM } from 'jsdom';

// prettier-ignore
const ALLOWED_TAGS = new Set([
  'p', 'h2', 'h3', 'h4', 'h5', 'h6', 'strong', 'em', 's', 'code', 'pre', 'blockquote', 'ul', 'ol', 'li', 'a', 'img',
  'hr', 'br', 'table', 'thead', 'tbody', 'tr', 'th', 'td',
]);
const SAFE_URL = /^(https?:\/\/|mailto:|\/(?!\/)|#)/i;

// What a renderer may add on top: more tags, class names, and exact attribute values (name="value").
export type Allowlist = { tags?: string[]; classes?: RegExp; attributes?: string[] };
const NONE: Allowlist = {};

// Parses the output and fails on anything outside a small allowlist of tags, attributes and URL schemes.
export function problems(html: string, extra: Allowlist = NONE): string[] {
  const doc = new JSDOM(`<body>${html}</body>`).window.document;
  const out: string[] = [];
  for (const el of doc.body.querySelectorAll('*')) {
    const tag = el.tagName.toLowerCase();
    if (!ALLOWED_TAGS.has(tag) && !extra.tags?.includes(tag)) out.push(`tag <${tag}>`);
    for (const { name, value } of el.attributes) {
      if (name === 'href' || name === 'src') {
        if (!SAFE_URL.test(value)) out.push(`${tag} ${name}="${value}"`);
        if (tag === 'img' && !value.startsWith('/')) out.push(`external image ${value}`);
      } else if (name === 'class') {
        if (!/^language-[\w+#-]+$/.test(value) && !extra.classes?.test(value)) out.push(`class="${value}"`);
      } else if (name === 'style') {
        if (!/^text-align:(left|right|center)$/.test(value)) out.push(`style="${value}"`);
      } else if (extra.attributes?.includes(`${name}="${value}"`)) {
        // allowed by the renderer
      } else if (!['alt', 'title', 'rel', 'target', 'start'].includes(name)) out.push(`attribute ${name} on <${tag}>`);
    }
  }
  return out;
}

export const XSS_CORPUS = [
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
