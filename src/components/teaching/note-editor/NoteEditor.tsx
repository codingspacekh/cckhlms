'use client';
import { EditorContent, ReactNodeViewRenderer, useEditor, useEditorState, type Editor } from '@tiptap/react';
import { useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { Icon, type IconName } from '@/components/ui/Icon';
import { CodeBlockView } from './CodeBlockView';
import { noteExtensions, tidyMarkdown } from './extensions';
import { PictureView } from './PictureView';
import { Select } from '@/components/ui/Select';

type Props = {
  initialMarkdown: string;
  // The class's language, for new code blocks.
  defaultLanguage?: string;
  onChange?: (markdown: string) => void;
  // Uploads a picture for the note and gives back its file id, or throws with a message to show (BR-22).
  // Without it, the editor offers no pictures.
  onPicture?: (file: File) => Promise<string>;
};
const PICTURE_TYPES = ['image/png', 'image/jpeg', 'image/gif', 'image/webp'];

const PLACEHOLDER = 'Type, or press / for code, a picture or a tip';
// Web and LMS addresses only, as renderNote allows (src/lib/markdown.ts).
const LINKABLE = /^(https?:\/\/|mailto:|\/(?!\/))/i;
// Plain text that looks like Markdown (a note kept in a text file, say) is pasted as formatting.
const LOOKS_LIKE_MARKDOWN = /(^|\n)(#{1,6} |[-*+] |\d+[.)] |> |```|~~~)|\*\*[^*\n]+\*\*|`[^`\n]+`|\[[^\]\n]+\]\([^)\n]+\)/;

type MenuItem = { id: string; label: string; hint: string; mark: string; run: (e: Editor) => void };

// The lesson note editor (FR-TCH-22): a word-processor-style editor that still saves Markdown in a hidden
// `contentMd` field, so the lesson form sends what it always sent.
export function NoteEditor({ initialMarkdown, defaultLanguage, onChange, onPicture }: Props) {
  const [markdown, setMarkdown] = useState(initialMarkdown);
  const [linking, setLinking] = useState(false);
  const [adding, setAdding] = useState<string | null>(null);
  const [pictureError, setPictureError] = useState('');
  const picker = useRef<HTMLInputElement>(null);
  // Where the menu was opened from: the + button, or a "/" typed at this position.
  const [menu, setMenu] = useState<{ slashAt: number | null } | null>(null);
  const changed = useRef(onChange);
  const self = useRef<Editor | null>(null);
  const addPictures = useRef<(files: File[]) => void>(() => {});
  useEffect(() => {
    changed.current = onChange;
    addPictures.current = async (files) => {
      for (const file of files) {
        if (!onPicture || !PICTURE_TYPES.includes(file.type)) continue;
        setPictureError('');
        setAdding(file.name);
        try {
          insertPicture(self.current, await onPicture(file));
        } catch (e) {
          setPictureError(e instanceof Error ? e.message : 'The picture couldn’t be added. Try again.');
        } finally {
          setAdding(null);
        }
      }
    };
  });
  const pictures = (list: FileList | File[] | undefined | null) => [...(list ?? [])].filter((f) => PICTURE_TYPES.includes(f.type));

  const editor = useEditor({
    extensions: noteExtensions({
      codeBlockView: () => ReactNodeViewRenderer(CodeBlockView),
      pictureView: () => ReactNodeViewRenderer(PictureView),
      placeholder: PLACEHOLDER,
      defaultLanguage,
    }),
    content: initialMarkdown,
    contentType: 'markdown',
    immediatelyRender: false,
    injectCSS: false, // the CSP only allows our own stylesheet; the editor's base styles are in globals.css
    editorProps: {
      attributes: { class: 'md reading note-doc', role: 'textbox', 'aria-multiline': 'true', 'aria-label': 'Lesson note' },
      // A "/" typed on an empty line opens the menu; the "/" stays if the menu is closed without choosing.
      handleTextInput: (view, from, _to, text) => {
        if (text === '/' && view.state.selection.$from.parent.textContent === '') setMenu({ slashAt: from });
        return false;
      },
      handlePaste: (view, e) => {
        const files = pictures(e.clipboardData?.files);
        if (files.length) {
          void addPictures.current(files);
          return true;
        }
        const text = e.clipboardData?.getData('text/plain') ?? '';
        if (!self.current || !text || e.clipboardData?.getData('text/html') || !LOOKS_LIKE_MARKDOWN.test(text)) return false;
        if (view.state.selection.$from.parent.type.spec.code) return false; // into a code block: as it is
        self.current.commands.insertContent(text, { contentType: 'markdown' });
        return true;
      },
      handleDrop: (_view, e, _slice, moved) => {
        const files = moved ? [] : pictures(e.dataTransfer?.files);
        if (!files.length) return false;
        e.preventDefault();
        void addPictures.current(files);
        return true;
      },
      handleKeyDown: (_view, e) => {
        if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
          setLinking(true);
          return true;
        }
        return false;
      },
    },
    onCreate: ({ editor: e }) => {
      self.current = e;
    },
    onUpdate: ({ editor: e }) => {
      const md = tidyMarkdown(e.getMarkdown());
      setMarkdown(md);
      changed.current?.(md);
    },
  });

  const items: MenuItem[] = [
    {
      id: 'code',
      label: 'Code',
      hint: 'Python, Java, HTML, CSS or JavaScript',
      mark: '</>',
      run: (e) => e.chain().focus().setCodeBlock().run(),
    },
    ...(onPicture
      ? [
          {
            id: 'picture',
            label: 'Picture',
            hint: 'From your computer, or paste a screenshot',
            mark: '▣',
            run: () => picker.current?.click(),
          },
        ]
      : []),
    { id: 'tip', label: 'Tip box', hint: 'A hint or something to remember', mark: '!', run: (e) => e.chain().focus().toggleTipBox().run() },
    {
      id: 'heading',
      label: 'Heading',
      hint: 'Start a new part of the lesson',
      mark: 'H',
      run: (e) => e.chain().focus().setHeading({ level: 2 }).run(),
    },
    { id: 'list', label: 'List', hint: 'Bullets for a few points', mark: '•', run: (e) => e.chain().focus().toggleBulletList().run() },
    { id: 'link', label: 'Link', hint: 'To a website or another week', mark: '↗', run: () => setLinking(true) },
  ];

  function choose(item: MenuItem) {
    if (!editor) return;
    const at = menu?.slashAt;
    setMenu(null);
    if (at != null && editor.state.doc.textBetween(at, at + 1) === '/')
      editor
        .chain()
        .focus()
        .deleteRange({ from: at, to: at + 1 })
        .run();
    item.run(editor);
  }

  return (
    <div className="note-editor">
      {editor && <Toolbar editor={editor} onLink={() => setLinking(true)} onPicture={onPicture && (() => picker.current?.click())} />}
      {onPicture && (
        <input
          ref={picker}
          type="file"
          accept={PICTURE_TYPES.join(',')}
          aria-label="Choose a picture"
          hidden
          onChange={(e) => {
            void addPictures.current(pictures(e.target.files));
            e.target.value = '';
          }}
        />
      )}
      {editor && linking && <LinkForm editor={editor} onDone={() => setLinking(false)} />}
      <EditorContent editor={editor} />
      <p className="xs muted note-adding" aria-live="polite">
        {adding ? `Adding ${adding}…` : ''}
      </p>
      {pictureError && (
        <p className="note bad note-picture-error" role="alert">
          {pictureError}
        </p>
      )}
      <div className="note-add">
        <button
          type="button"
          className="note-add-button"
          aria-label="Add code, a picture or a tip"
          aria-haspopup="menu"
          aria-expanded={menu !== null}
          onClick={() => setMenu(menu ? null : { slashAt: null })}
        >
          <Icon name="plus" />
        </button>
        <span className="small muted">Add code, a picture or a tip</span>
        {editor && menu && (
          <InsertMenu
            items={items}
            onChoose={choose}
            onClose={(typed) => {
              setMenu(null);
              editor.commands.focus();
              if (typed) editor.commands.insertContent(typed);
            }}
          />
        )}
      </div>
      <input type="hidden" name="contentMd" value={markdown} />
    </div>
  );
}

function Toolbar({ editor, onLink, onPicture }: { editor: Editor; onLink: () => void; onPicture?: () => void }) {
  const s = useEditorState({
    editor,
    selector: ({ editor: e }) => ({
      style: e.isActive('heading', { level: 1 }) || e.isActive('heading', { level: 2 }) ? 'h2' : e.isActive('heading') ? 'h3' : 'p',
      bold: e.isActive('bold'),
      italic: e.isActive('italic'),
      code: e.isActive('code'),
      link: e.isActive('link'),
      bullets: e.isActive('bulletList'),
      numbers: e.isActive('orderedList'),
      codeBlock: e.isActive('codeBlock'),
      tip: e.isActive('tipBox'),
      undo: e.can().undo(),
      redo: e.can().redo(),
    }),
  });
  const run = (f: (c: ReturnType<Editor['chain']>) => ReturnType<Editor['chain']>) => f(editor.chain().focus()).run();
  return (
    <div className="note-toolbar" role="toolbar" aria-label="Formatting">
      <label className="note-style">
        <span className="sr-only">Text style</span>
        <Select
          value={s.style}
          onChange={(e) =>
            run((c) => (e.target.value === 'p' ? c.setParagraph() : c.setHeading({ level: e.target.value === 'h2' ? 2 : 3 })))
          }
        >
          <option value="p">Normal text</option>
          <option value="h2">Heading</option>
          <option value="h3">Small heading</option>
        </Select>
      </label>
      <span className="note-sep" aria-hidden="true" />
      <Tool icon="bold" label="Bold (Ctrl+B)" pressed={s.bold} onClick={() => run((c) => c.toggleBold())} />
      <Tool icon="italic" label="Italic (Ctrl+I)" pressed={s.italic} onClick={() => run((c) => c.toggleItalic())} />
      <Tool icon="code" label="Code in a sentence" pressed={s.code} onClick={() => run((c) => c.toggleCode())} />
      <Tool icon="link" label="Link (Ctrl+K)" pressed={s.link} onClick={onLink} />
      <span className="note-sep" aria-hidden="true" />
      <Tool icon="list" label="Bulleted list" pressed={s.bullets} onClick={() => run((c) => c.toggleBulletList())} />
      <Tool icon="numbered" label="Numbered list" pressed={s.numbers} onClick={() => run((c) => c.toggleOrderedList())} />
      <span className="note-sep" aria-hidden="true" />
      <Tool icon="code-block" label="Code block" text="Code" pressed={s.codeBlock} onClick={() => run((c) => c.toggleCodeBlock())} />
      {onPicture && <Tool icon="image" label="Picture" text="Picture" onClick={onPicture} />}
      <Tool icon="tip" label="Tip box" text="Tip box" pressed={s.tip} onClick={() => run((c) => c.toggleTipBox())} />
      <span className="note-gap" />
      <Tool icon="undo" label="Undo (Ctrl+Z)" disabled={!s.undo} onClick={() => run((c) => c.undo())} />
      <Tool icon="redo" label="Redo (Ctrl+Shift+Z)" disabled={!s.redo} onClick={() => run((c) => c.redo())} />
    </div>
  );
}

type ToolProps = { icon: IconName; label: string; text?: string; pressed?: boolean; disabled?: boolean; onClick: () => void };
function Tool({ icon, label, text, pressed, disabled, onClick }: ToolProps) {
  return (
    <button
      type="button"
      className={text ? 'tool wide' : 'tool'}
      aria-label={label}
      title={label}
      aria-pressed={pressed === undefined ? undefined : pressed}
      disabled={disabled}
      // Keep the editor's selection while the button is pressed.
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
    >
      <Icon name={icon} />
      {text && <span aria-hidden="true">{text}</span>}
    </button>
  );
}

function LinkForm({ editor, onDone }: { editor: Editor; onDone: () => void }) {
  const [href, setHref] = useState(String(editor.getAttributes('link').href ?? ''));
  const [error, setError] = useState('');
  const had = editor.isActive('link');

  function apply() {
    const url = href.trim();
    if (!LINKABLE.test(url)) return setError('Start the address with https:// (or / for a page in the LMS).');
    const chain = editor.chain().focus().extendMarkRange('link');
    if (editor.state.selection.empty && !had)
      chain.insertContent({ type: 'text', text: url, marks: [{ type: 'link', attrs: { href: url } }] });
    else chain.setLink({ href: url });
    chain.run();
    onDone();
  }

  return (
    <div className="note-link" role="group" aria-label="Link">
      <label className="f">
        Link address
        <input
          type="url"
          value={href}
          autoFocus
          placeholder="https://"
          onChange={(e) => setHref(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault(); // not the lesson form
              apply();
            } else if (e.key === 'Escape') onDone();
          }}
        />
      </label>
      <div className="row">
        <button type="button" className="btn sm primary" onClick={apply}>
          {had ? 'Change link' : 'Add link'}
        </button>
        {had && (
          <button
            type="button"
            className="btn sm"
            onClick={() => {
              editor.chain().focus().extendMarkRange('link').unsetLink().run();
              onDone();
            }}
          >
            Remove link
          </button>
        )}
        <button
          type="button"
          className="btn sm ghost"
          onClick={() => {
            editor.commands.focus();
            onDone();
          }}
        >
          Cancel
        </button>
      </div>
      {error && (
        <p className="xs bad-text" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

// The + and / menu: arrow keys move, Enter chooses, Escape closes. Typing a letter closes it and types the letter.
function InsertMenu({
  items,
  onChoose,
  onClose,
}: {
  items: MenuItem[];
  onChoose: (i: MenuItem) => void;
  onClose: (typed?: string) => void;
}) {
  const list = useRef<HTMLDivElement>(null);
  useEffect(() => list.current?.querySelector<HTMLButtonElement>('[role="menuitem"]')?.focus(), []);

  function keys(e: KeyboardEvent<HTMLDivElement>) {
    const buttons = [...(list.current?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]') ?? [])];
    const at = buttons.indexOf(document.activeElement as HTMLButtonElement);
    const move = (i: number) => buttons[(i + buttons.length) % buttons.length]?.focus();
    if (e.key === 'ArrowDown') move(at + 1);
    else if (e.key === 'ArrowUp') move(at - 1);
    else if (e.key === 'Home') move(0);
    else if (e.key === 'End') move(buttons.length - 1);
    else if (e.key === 'Escape' || e.key === 'Tab') onClose();
    else if (e.key.length === 1 && e.key !== ' ' && !e.metaKey && !e.ctrlKey) onClose(e.key);
    else return;
    e.preventDefault();
  }

  return (
    <div ref={list} className="note-menu" role="menu" aria-label="Add" onKeyDown={keys}>
      {items.map((item) => (
        <MenuButton key={item.id} item={item} onChoose={onChoose}>
          {item.label}
        </MenuButton>
      ))}
    </div>
  );
}

function MenuButton({ item, onChoose, children }: { item: MenuItem; onChoose: (i: MenuItem) => void; children: ReactNode }) {
  return (
    <button type="button" role="menuitem" tabIndex={-1} className={`note-menu-item is-${item.id}`} onClick={() => onChoose(item)}>
      <span className="mark" aria-hidden="true">
        {item.mark}
      </span>
      <span className="text">
        <strong>{children}</strong>
        <span className="hint">{item.hint}</span>
      </span>
    </button>
  );
}

// A new picture goes in its own paragraph after the one the cursor is in (or in place of an empty one).
function insertPicture(editor: Editor | null, id: string) {
  if (!editor) return;
  const { $from } = editor.state.selection;
  const picture = { type: 'paragraph', content: [{ type: 'image', attrs: { src: `/api/files/${id}#medium`, alt: '' } }] };
  if ($from.depth < 1) return void editor.chain().focus().insertContentAt(editor.state.doc.content.size, picture).run();
  const block = $from.node(1);
  const at = block.type.name === 'paragraph' && block.content.size === 0 ? { from: $from.before(1), to: $from.after(1) } : $from.after(1);
  editor.chain().focus().insertContentAt(at, picture).run();
}
