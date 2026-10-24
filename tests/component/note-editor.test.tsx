// FR-TCH-22 (M9): the lesson note editor. Teachers format with the toolbar or the + menu instead of typing Markdown,
// and the form still sends Markdown (a hidden contentMd field), so saving works as before.
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { NoteEditor } from '@/components/teaching/note-editor/NoteEditor';

// jsdom has no layout; ProseMirror measures ranges when it scrolls to the cursor.
beforeAll(() => {
  const none = () => Object.assign([], { item: () => null }) as unknown as DOMRectList;
  Range.prototype.getClientRects = none;
  Range.prototype.getBoundingClientRect = () => new DOMRect();
  document.elementFromPoint = () => null;
});
afterEach(cleanup);
const names = (items: HTMLElement[]) => items.map((b) => b.querySelector('strong')!.textContent);

async function setup(initial = 'Hello', props: Partial<Parameters<typeof NoteEditor>[0]> = {}) {
  const onChange = vi.fn();
  const view = render(
    <form aria-label="Note">
      <NoteEditor initialMarkdown={initial} onChange={onChange} {...props} />
    </form>,
  );
  const doc = await screen.findByRole('textbox', { name: 'Lesson note' });
  const saved = () => (view.container.querySelector('input[name="contentMd"]') as HTMLInputElement).value;
  const tool = (name: string) => within(screen.getByRole('toolbar', { name: 'Formatting' })).getByRole('button', { name });
  const selectAll = () => act(() => void fireEvent.keyDown(doc, { key: 'a', ctrlKey: true }));
  return { doc, saved, tool, selectAll, onChange };
}

describe('NoteEditor', () => {
  it('shows the saved note formatted, and keeps its Markdown in the form', async () => {
    const { doc, saved } = await setup('## Today\n\nWe used **loops**.');
    expect(within(doc).getByRole('heading', { name: 'Today' })).toBeTruthy();
    expect(doc.querySelector('strong')!.textContent).toBe('loops');
    expect(saved()).toBe('## Today\n\nWe used **loops**.');
  });

  it('changes the text style from the toolbar', async () => {
    const { saved, onChange } = await setup();
    const style = screen.getByRole('combobox', { name: 'Text style' });
    fireEvent.change(style, { target: { value: 'h2' } });
    await waitFor(() => expect(saved()).toBe('## Hello'));
    fireEvent.change(style, { target: { value: 'h3' } });
    await waitFor(() => expect(saved()).toBe('### Hello'));
    fireEvent.change(style, { target: { value: 'p' } });
    await waitFor(() => expect(saved()).toBe('Hello'));
    expect(onChange).toHaveBeenLastCalledWith('Hello');
  });

  it('makes text bold and italic, and shows which are on', async () => {
    const { saved, tool, selectAll } = await setup();
    await selectAll();
    fireEvent.click(tool('Bold (Ctrl+B)'));
    await waitFor(() => expect(saved()).toBe('**Hello**'));
    expect(tool('Bold (Ctrl+B)').getAttribute('aria-pressed')).toBe('true');
    expect(tool('Italic (Ctrl+I)').getAttribute('aria-pressed')).toBe('false');
    fireEvent.click(tool('Italic (Ctrl+I)'));
    await waitFor(() => expect(saved()).toBe('***Hello***'));
  });

  it('makes lists', async () => {
    const { saved, tool } = await setup();
    fireEvent.click(tool('Bulleted list'));
    await waitFor(() => expect(saved()).toBe('- Hello'));
    fireEvent.click(tool('Numbered list'));
    await waitFor(() => expect(saved()).toBe('1. Hello'));
  });

  it('adds a code block in the class’s language, and the language can be changed', async () => {
    const { saved, tool, doc } = await setup('print(1)', { defaultLanguage: 'python' });
    fireEvent.click(tool('Code block'));
    await waitFor(() => expect(saved()).toBe('```python\nprint(1)\n```'));
    const language = await within(doc.parentElement!).findByRole('combobox', { name: 'Language' });
    expect((language as HTMLSelectElement).value).toBe('python');
    fireEvent.change(language, { target: { value: 'java' } });
    await waitFor(() => expect(saved()).toBe('```java\nprint(1)\n```'));
  });

  it('puts text in a tip box, and undo takes it out again', async () => {
    const { saved, tool } = await setup();
    fireEvent.click(tool('Tip box'));
    await waitFor(() => expect(saved()).toBe('> [!TIP]\n> Hello'));
    expect(tool('Tip box').getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(tool('Undo (Ctrl+Z)'));
    await waitFor(() => expect(saved()).toBe('Hello'));
  });

  it('adds a link to the selected text, and refuses addresses that aren’t web or LMS pages', async () => {
    const { saved, tool, selectAll } = await setup();
    await selectAll();
    fireEvent.click(tool('Link (Ctrl+K)'));
    const address = screen.getByRole('textbox', { name: 'Link address' });
    fireEvent.change(address, { target: { value: 'javascript:alert(1)' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add link' }));
    expect(screen.getByRole('alert').textContent).toMatch(/https:\/\//);
    expect(saved()).toBe('Hello');
    fireEvent.change(address, { target: { value: 'https://docs.python.org/3/' } });
    fireEvent.keyDown(address, { key: 'Enter' }); // Enter adds the link; it doesn't send the lesson form
    await waitFor(() => expect(saved()).toBe('[Hello](https://docs.python.org/3/)'));
    expect(screen.queryByRole('textbox', { name: 'Link address' })).toBeNull();
  });

  it('opens the + menu, and adds a tip box from it', async () => {
    const { saved } = await setup();
    fireEvent.click(screen.getByRole('button', { name: 'Add code, a picture or a tip' }));
    const menu = screen.getByRole('menu', { name: 'Add' });
    expect(names(within(menu).getAllByRole('menuitem'))).toEqual(['Code', 'Tip box', 'Heading', 'List', 'Link']);
    await waitFor(() => expect(document.activeElement).toBe(within(menu).getAllByRole('menuitem')[0]));
    fireEvent.keyDown(document.activeElement!, { key: 'ArrowDown' });
    expect(names([document.activeElement as HTMLElement])).toEqual(['Tip box']);
    fireEvent.click(document.activeElement!);
    await waitFor(() => expect(saved()).toBe('> [!TIP]\n> Hello'));
    expect(screen.queryByRole('menu')).toBeNull();
  });

  it('closes the menu with Escape', async () => {
    await setup();
    fireEvent.click(screen.getByRole('button', { name: 'Add code, a picture or a tip' }));
    fireEvent.keyDown(screen.getAllByRole('menuitem')[0]!, { key: 'Escape' });
    expect(screen.queryByRole('menu')).toBeNull();
  });

  it('turns pasted Markdown into formatting, and leaves other pasted text alone', async () => {
    const paste = (text: string, html = '') =>
      act(
        () =>
          void fireEvent.paste(doc, {
            clipboardData: { getData: (t: string) => (t === 'text/plain' ? text : t === 'text/html' ? html : ''), types: ['text/plain'] },
          }),
      );
    const { doc, saved } = await setup('');
    await paste('## Links\nUse `<a href="...">` to link pages.\n\n> [!TIP]\n> Close the tag.');
    await waitFor(() => expect(saved()).toBe('## Links\n\nUse `<a href="...">` to link pages.\n\n> [!TIP]\n> Close the tag.'));
    expect(within(doc).getByRole('heading', { name: 'Links' })).toBeTruthy();
  });

  it('pastes plain text as text, even with Markdown-like characters in a sentence', async () => {
    const { doc, saved } = await setup('');
    act(
      () =>
        void fireEvent.paste(doc, {
          clipboardData: { getData: (t: string) => (t === 'text/plain' ? 'Cost: 5 * 3 = 15' : ''), types: ['text/plain'] },
        }),
    );
    await waitFor(() => expect(saved()).toBe('Cost: 5 \\* 3 = 15'));
  });

  it('doesn’t send the form from its buttons', async () => {
    const submit = vi.fn((e: Event) => e.preventDefault());
    const { tool } = await setup();
    screen.getByRole('form', { name: 'Note' }).addEventListener('submit', submit);
    for (const b of within(screen.getByRole('toolbar', { name: 'Formatting' })).getAllByRole('button')) fireEvent.click(b);
    expect(submit).not.toHaveBeenCalled();
    expect(tool('Undo (Ctrl+Z)').getAttribute('type')).toBe('button');
  });
});
