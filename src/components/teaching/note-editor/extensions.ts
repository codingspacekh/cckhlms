// The lesson note editor's document model (FR-TCH-22, BR-22). The note is still stored as Markdown, so every node
// here reads and writes the same Markdown that renderNote (src/lib/markdown.ts) shows to students:
// - raw HTML stays text, as it does in renderNote (markdown-it with html: false), instead of becoming formatting;
// - `> [!TIP]` is a tip box;
// - pictures come only from the LMS itself (a pasted web picture is dropped, as renderNote would only link it);
// - code blocks are coloured with the same parsers as the reading view;
// - tables written before M9 are kept (there's no button to add one).
import { Extension, mergeAttributes, Node, type AnyExtension, type JSONContent, type NodeViewRenderer } from '@tiptap/core';
import Blockquote from '@tiptap/extension-blockquote';
import CodeBlock from '@tiptap/extension-code-block';
import Image from '@tiptap/extension-image';
import { BulletList, OrderedList } from '@tiptap/extension-list';
import Paragraph from '@tiptap/extension-paragraph';
import { TableKit } from '@tiptap/extension-table';
import { Placeholder } from '@tiptap/extensions';
import { Markdown } from '@tiptap/markdown';
import type { Node as PmNode } from '@tiptap/pm/model';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';
import StarterKit from '@tiptap/starter-kit';
import { Marked, type Tokens } from 'marked';
import { highlightLines } from '@/lib/code-highlight';

const TIP = /^\[!tip\][ \t]*/i;
const isLocal = (src: string) => src.startsWith('/') && !src.startsWith('//');

// Markdown parsing as renderNote does it: line breaks are kept, and HTML tags are just text. Autolinks such as
// <https://example.com> aren't tags, so they stay links.
const HTML_BLOCK = /^ {0,3}(?:<\/?[a-zA-Z][\w-]*(?=[\s/>]|$)|<!--|<\?|<![A-Z])[^\n]*(?:\n(?!\s*\n)[^\n]*)*/;
const HTML_TAG = /^(?:<!--[\s\S]*?-->|<\/?[a-zA-Z][\w-]*(?=[\s/>]|$)[^>\n]*>?|<\?[^>\n]*>?|<![A-Z][^>\n]*>?)/;
function noteMarked() {
  const marked = new Marked({ gfm: true, breaks: true });
  marked.use({
    tokenizer: {
      html(src: string) {
        const m = HTML_BLOCK.exec(src);
        if (!m) return undefined;
        // Each line of the block becomes text, with a line break between, as markdown-it shows it.
        const tokens = m[0]
          .split('\n')
          .flatMap((line, i): (Tokens.Text | Tokens.Br)[] => [
            ...(i ? [{ type: 'br', raw: '\n' } as Tokens.Br] : []),
            { type: 'text', raw: line, text: line },
          ]);
        // A paragraph of text where marked expects an HTML token: that is the point.
        return { type: 'paragraph', raw: m[0], text: m[0], tokens } satisfies Tokens.Paragraph as unknown as Tokens.HTML;
      },
      tag(src: string) {
        const m = HTML_TAG.exec(src);
        return m ? ({ type: 'text', raw: m[0], text: m[0] } satisfies Tokens.Text as unknown as Tokens.Tag) : undefined;
      },
    },
  });
  return marked;
}

// A tip box: one or more paragraphs, written as `> [!TIP]` and then the text, each line quoted.
export const TipBox = Node.create({
  name: 'tipBox',
  group: 'block',
  content: 'paragraph+',
  defining: true,
  parseHTML: () => [{ tag: 'div[data-tip]' }],
  renderHTML: ({ HTMLAttributes }) => ['div', mergeAttributes(HTMLAttributes, { 'data-tip': '', class: 'tip-box' }), 0],
  renderMarkdown: (node: JSONContent, h) => {
    const paragraphs = (node.content ?? []).map((child) =>
      h
        .renderChildren([child])
        .split('\n')
        .map((line) => (line.trim() ? `> ${line}` : '>'))
        .join('\n'),
    );
    return ['> [!TIP]', paragraphs.join('\n>\n')].join('\n');
  },
  addCommands() {
    return {
      toggleTipBox:
        () =>
        ({ commands }) =>
          commands.toggleWrap(this.name),
    };
  },
});

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    tipBox: { toggleTipBox: () => ReturnType };
  }
}

// A quote that starts with [!TIP] is read as a tip box, without the marker.
const NoteBlockquote = Blockquote.extend({
  parseMarkdown(token, helpers) {
    const blocks = [...(token.tokens ?? [])];
    const first = blocks[0];
    if (first?.type !== 'paragraph' || !TIP.test(first.text ?? '')) return this.parent!(token, helpers);
    const inline = [...(first.tokens ?? [])];
    const lead = inline[0]!;
    const rest = (lead.text ?? '').replace(TIP, '');
    if (rest) inline[0] = { ...lead, raw: rest, text: rest };
    else inline.splice(0, inline[1]?.type === 'br' ? 2 : 1);
    if (inline.length) blocks[0] = { ...first, tokens: inline };
    else blocks.shift();
    const content = (helpers.parseBlockChildren ?? helpers.parseChildren)(blocks);
    return helpers.createNode('tipBox', undefined, content.length ? content : [helpers.createNode('paragraph')]);
  },
});

// A paragraph holding only a picture stays a paragraph (Tiptap would lift the picture out of it, and then join it
// with the next one).
const NoteParagraph = Paragraph.extend({
  parseMarkdown(token, helpers) {
    const inline = token.tokens ?? [];
    if (inline.length === 1 && inline[0]!.type === 'image') return helpers.createNode('paragraph', undefined, helpers.parseInline(inline));
    return this.parent!(token, helpers);
  },
});

// A list with blank lines between its items (or between blocks in an item) is "loose": renderNote puts each item's
// text in a paragraph. Keep it loose, so its spacing doesn't change.
const looseList = {
  addAttributes(this: { parent?: () => Record<string, unknown> }) {
    return { ...this.parent?.(), loose: { default: false, rendered: false } };
  },
  parseMarkdown(this: { parent?: (t: never, h: never) => unknown }, token: { raw?: string }, helpers: never) {
    const node = this.parent!(token as never, helpers) as JSONContent | JSONContent[];
    if (Array.isArray(node)) return node; // a list of the other kind
    return { ...node, attrs: { ...node.attrs, loose: /\n[ \t]*\n/.test((token.raw ?? '').trim()) } };
  },
  renderMarkdown: (node: JSONContent, h: { renderChildren: (nodes: JSONContent[], separator?: string) => string }) =>
    node.content ? h.renderChildren(node.content, node.attrs?.loose ? '\n\n' : '\n') : '',
};
const NoteBulletList = BulletList.extend(looseList as never);
const NoteOrderedList = OrderedList.extend(looseList as never);

// Pictures stay inline, as in Markdown: one alone in a paragraph is shown as a figure by renderNote.
const NoteImage = Image.extend({
  parseHTML: () => [{ tag: 'img[src]', getAttrs: (el) => (isLocal((el as HTMLElement).getAttribute('src') ?? '') ? null : false) }],
}).configure({ inline: true, allowBase64: false });

// Colours code blocks as the reading view does: the same tok-* classes from the same parsers.
function codeColours(doc: PmNode) {
  const found: Decoration[] = [];
  doc.descendants((node, pos) => {
    if (node.type.name !== 'codeBlock') return true;
    let at = pos + 1;
    for (const line of highlightLines(node.textContent, String(node.attrs.language ?? ''))) {
      for (const run of line) {
        if (run.cls) found.push(Decoration.inline(at, at + run.text.length, { class: run.cls }));
        at += run.text.length;
      }
      at += 1; // the line break
    }
    return false;
  });
  return DecorationSet.create(doc, found);
}
const CodeColours = Extension.create({
  name: 'codeColours',
  addProseMirrorPlugins() {
    const key = new PluginKey<DecorationSet>('codeColours');
    return [
      new Plugin<DecorationSet>({
        key,
        state: { init: (_, { doc }) => codeColours(doc), apply: (tr, set) => (tr.docChanged ? codeColours(tr.doc) : set) },
        props: { decorations: (state) => key.getState(state) },
      }),
    ];
  },
});

type Options = {
  // The React node view for code blocks (language picker); left out in headless use, such as the tests.
  codeBlockView?: () => NodeViewRenderer;
  placeholder?: string;
  defaultLanguage?: string;
};

export function noteExtensions({ codeBlockView, placeholder, defaultLanguage = 'python' }: Options = {}): AnyExtension[] {
  const NoteCodeBlock = CodeBlock.extend({
    addOptions() {
      return { ...this.parent!(), defaultLanguage, enableTabIndentation: true, tabSize: 4 };
    },
    // The fence is longer than any run of backticks in the code, so code about Markdown survives.
    renderMarkdown: (node: JSONContent) => {
      const code = (node.content ?? []).map((c) => c.text ?? '').join('');
      const longest = Math.max(0, ...[...code.matchAll(/`+/g)].map((m) => m[0].length));
      const fence = '`'.repeat(Math.max(3, longest + 1));
      return `${fence}${node.attrs?.language ?? ''}\n${code}\n${fence}`;
    },
    ...(codeBlockView ? { addNodeView: codeBlockView } : {}),
  });
  return [
    StarterKit.configure({
      paragraph: false,
      bulletList: false,
      orderedList: false,
      blockquote: false,
      codeBlock: false,
      underline: false,
      link: { openOnClick: false, autolink: true },
    }),
    NoteParagraph,
    NoteBulletList,
    NoteOrderedList,
    NoteBlockquote,
    TipBox,
    NoteCodeBlock,
    CodeColours,
    NoteImage,
    TableKit,
    Markdown.configure({ marked: noteMarked() as never }),
    ...(placeholder ? [Placeholder.configure({ placeholder })] : []),
  ];
}

// The Markdown the editor saves: Tiptap leaves blank lines at the start and end.
export const tidyMarkdown = (md: string) => md.replace(/^\n+|\s+$/g, '');
