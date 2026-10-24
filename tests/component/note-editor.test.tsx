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

  describe('pictures', () => {
    const ID = '11111111-2222-3333-4444-555555555555';
    const file = () => new File([new Uint8Array([137, 80, 78, 71])], 'output.png', { type: 'image/png' });

    it('adds a picture from the toolbar: uploads it, then puts it after the current paragraph, medium size', async () => {
      const onPicture = vi.fn().mockResolvedValue(ID);
      const { saved, tool } = await setup('Hello', { onPicture });
      expect(tool('Picture')).toBeTruthy();
      fireEvent.change(screen.getByLabelText('Choose a picture'), { target: { files: [file()] } });
      expect(onPicture).toHaveBeenCalledWith(expect.objectContaining({ name: 'output.png' }));
      await waitFor(() => expect(saved()).toBe(`Hello\n\n![](/api/files/${ID}#medium)`));
    });

    it('says it’s adding the picture, and why it couldn’t', async () => {
      let fail: (e: Error) => void = () => {};
      const onPicture = vi.fn(() => new Promise<string>((_, reject) => (fail = reject)));
      const { saved } = await setup('Hello', { onPicture });
      fireEvent.change(screen.getByLabelText('Choose a picture'), { target: { files: [file()] } });
      await waitFor(() => expect(screen.getByText('Adding output.png…')).toBeTruthy());
      await act(async () => fail(new Error('output.png is bigger than 2 MB.')));
      expect(screen.getByRole('alert').textContent).toBe('output.png is bigger than 2 MB.');
      expect(saved()).toBe('Hello');
    });

    it('uploads a pasted screenshot (dropping one is tested in the browser: jsdom has no layout to drop on)', async () => {
      const onPicture = vi.fn().mockResolvedValue(ID);
      const { doc, saved } = await setup('Hello', { onPicture });
      act(() => void fireEvent.paste(doc, { clipboardData: { files: [file()], getData: () => '', types: ['Files'] } }));
      await waitFor(() => expect(saved()).toBe(`Hello\n\n![](/api/files/${ID}#medium)`));
    });

    it('lists Picture in the + menu when pictures can be added', async () => {
      await setup('Hello', { onPicture: vi.fn() });
      fireEvent.click(screen.getByRole('button', { name: 'Add code, a picture or a tip' }));
      expect(names(screen.getAllByRole('menuitem'))).toEqual(['Code', 'Picture', 'Tip box', 'Heading', 'List', 'Link']);
    });

    it('puts a picture in place of an empty line, and shows a picture from before M9 with no size picked', async () => {
      const onPicture = vi.fn().mockResolvedValue(ID);
      const { saved } = await setup('', { onPicture });
      fireEvent.change(screen.getByLabelText('Choose a picture'), { target: { files: [file()] } });
      await waitFor(() => expect(saved()).toBe(`![](/api/files/${ID}#medium)`));
      cleanup();
      await setup('![Loop diagram](/files/abc)', { onPicture });
      const sizes = await screen.findByRole('group', { name: 'Picture size' });
      expect(
        within(sizes)
          .getAllByRole('button')
          .map((b) => b.getAttribute('aria-pressed')),
      ).toEqual(['false', 'false', 'false']);
      expect((screen.getByRole('textbox', { name: /^Caption/ }) as HTMLInputElement).value).toBe('Loop diagram');
    });

    it('ignores files that aren’t pictures, and explains a failure that has no message', async () => {
      const onPicture = vi.fn().mockRejectedValue('offline');
      const { doc } = await setup('Hello', { onPicture });
      act(
        () =>
          void fireEvent.paste(doc, {
            clipboardData: { files: [new File(['x'], 'notes.pdf', { type: 'application/pdf' })], getData: () => '', types: ['Files'] },
          }),
      );
      expect(onPicture).not.toHaveBeenCalled();
      fireEvent.change(screen.getByLabelText('Choose a picture'), { target: { files: [file()] } });
      await waitFor(() => expect(screen.getByRole('alert').textContent).toBe('The picture couldn’t be added. Try again.'));
    });

    it('changes a picture’s size and caption, and removes it', async () => {
      const { saved } = await setup(`![](/api/files/${ID}#medium)`, { onPicture: vi.fn() });
      const tools = await screen.findByRole('group', { name: 'Picture size' });
      expect(within(tools).getByRole('button', { name: 'Medium' }).getAttribute('aria-pressed')).toBe('true');
      fireEvent.click(within(tools).getByRole('button', { name: 'Small' }));
      await waitFor(() => expect(saved()).toBe(`![](/api/files/${ID}#small)`));
      fireEvent.change(screen.getByRole('textbox', { name: /^Caption/ }), { target: { value: 'What you should see' } });
      await waitFor(() => expect(saved()).toBe(`![What you should see](/api/files/${ID}#small)`));
      fireEvent.click(screen.getByRole('button', { name: 'Remove picture' }));
      await waitFor(() => expect(saved()).toBe(''));
    });
  });

  it('doesn’t send the form from its buttons', async () => {
    const submit = vi.fn((e: Event) => e.preventDefault());
    const { tool } = await setup();
    screen.getByRole('form', { name: 'Note' }).addEventListener('submit', submit);
    for (const b of within(screen.getByRole('toolbar', { name: 'Formatting' })).getAllByRole('button')) fireEvent.click(b);
    expect(submit).not.toHaveBeenCalled();
    expect(tool('Undo (Ctrl+Z)').getAttribute('type')).toBe('button');
  });

  describe('more about links', () => {
    it('opens the link form with Ctrl+K, and closes it with Escape or Cancel', async () => {
      const { doc } = await setup();
      act(() => void fireEvent.keyDown(doc, { key: 'k', ctrlKey: true }));
      const address = screen.getByRole('textbox', { name: 'Link address' });
      fireEvent.keyDown(address, { key: 'Escape' });
      expect(screen.queryByRole('group', { name: 'Link' })).toBeNull();
      act(() => void fireEvent.keyDown(doc, { key: 'k', ctrlKey: true }));
      fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
      expect(screen.queryByRole('group', { name: 'Link' })).toBeNull();
    });

    it('adds the address itself as the link text when nothing is selected', async () => {
      const { saved, tool } = await setup('');
      fireEvent.click(tool('Link (Ctrl+K)'));
      fireEvent.change(screen.getByRole('textbox', { name: 'Link address' }), { target: { value: '/student/classes/c1/weeks/2' } });
      fireEvent.click(screen.getByRole('button', { name: 'Add link' }));
      await waitFor(() => expect(saved()).toBe('[/student/classes/c1/weeks/2](/student/classes/c1/weeks/2)'));
    });

    it('changes or removes a link that is already there', async () => {
      const { saved, tool, selectAll } = await setup('[Hello](https://a.example)');
      await selectAll();
      fireEvent.click(tool('Link (Ctrl+K)'));
      const address = screen.getByRole('textbox', { name: 'Link address' }) as HTMLInputElement;
      expect(address.value).toBe('https://a.example');
      fireEvent.change(address, { target: { value: 'https://b.example' } });
      fireEvent.click(screen.getByRole('button', { name: 'Change link' }));
      await waitFor(() => expect(saved()).toBe('[Hello](https://b.example)'));
      await selectAll();
      fireEvent.click(tool('Link (Ctrl+K)'));
      fireEvent.click(screen.getByRole('button', { name: 'Remove link' }));
      await waitFor(() => expect(saved()).toBe('Hello'));
    });
  });

  describe('more about the menu', () => {
    const open = () => fireEvent.click(screen.getByRole('button', { name: 'Add code, a picture or a tip' }));
    const focused = () => names([document.activeElement as HTMLElement])[0];

    it('moves with the arrow keys, Home and End, wrapping round', async () => {
      await setup();
      open();
      await waitFor(() => expect(focused()).toBe('Code'));
      fireEvent.keyDown(document.activeElement!, { key: 'ArrowUp' });
      expect(focused()).toBe('Link');
      fireEvent.keyDown(document.activeElement!, { key: 'Home' });
      expect(focused()).toBe('Code');
      fireEvent.keyDown(document.activeElement!, { key: 'End' });
      expect(focused()).toBe('Link');
      fireEvent.keyDown(document.activeElement!, { key: 'ArrowDown' });
      expect(focused()).toBe('Code');
      fireEvent.keyDown(document.activeElement!, { key: 'Enter' }); // not a key the menu handles: the button does
      expect(screen.getByRole('menu')).toBeTruthy();
    });

    it('closes when you start typing, and types the letter in the note', async () => {
      const { saved } = await setup('');
      open();
      fireEvent.keyDown(screen.getAllByRole('menuitem')[0]!, { key: 'x' });
      expect(screen.queryByRole('menu')).toBeNull();
      await waitFor(() => expect(saved()).toBe('x'));
    });

    it('closes with Tab or the + button', async () => {
      await setup();
      open();
      fireEvent.keyDown(screen.getAllByRole('menuitem')[0]!, { key: 'Tab' });
      expect(screen.queryByRole('menu')).toBeNull();
      open();
      open();
      expect(screen.queryByRole('menu')).toBeNull();
    });

    it('adds a code block, a heading, a list or a link from the menu', async () => {
      const { saved } = await setup('Hello');
      const choose = (name: string) => {
        open();
        fireEvent.click(screen.getAllByRole('menuitem').find((b) => names([b])[0] === name)!);
      };
      choose('Heading');
      await waitFor(() => expect(saved()).toBe('## Hello'));
      choose('List');
      await waitFor(() => expect(saved()).toBe('- Hello')); // a heading becomes a plain list item
      choose('Code');
      await waitFor(() => expect(saved()).toMatch(/```python/));
      choose('Link');
      expect(screen.getByRole('textbox', { name: 'Link address' })).toBeTruthy();
    });
  });

  it('pastes Markdown into a code block as it is', async () => {
    const { doc, saved, tool } = await setup('');
    fireEvent.click(tool('Code block'));
    act(
      () =>
        void fireEvent.paste(doc, {
          clipboardData: { getData: (t: string) => (t === 'text/plain' ? '## not a heading' : ''), types: ['text/plain'] },
        }),
    );
    await waitFor(() => expect(saved()).toBe('```python\n## not a heading\n```'));
  });
});
