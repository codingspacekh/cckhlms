// M12 · FR-STU-03/04, BR-26: the compact editor for questions and replies (prototype board 3). Text, bold, italic,
// code, lists, links and code blocks in the class's language; no picture, tip box or heading buttons. It sends Markdown;
// what a post may show is renderPost's job (tests/unit/qa-render.test.ts).
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { NoteEditor } from '@/components/teaching/note-editor/NoteEditor';

beforeAll(() => {
  const none = () => Object.assign([], { item: () => null }) as unknown as DOMRectList;
  Range.prototype.getClientRects = none;
  Range.prototype.getBoundingClientRect = () => new DOMRect();
  document.elementFromPoint = () => null;
});
afterEach(cleanup);

async function setup(initial = '') {
  const view = render(
    <form aria-label="Ask">
      <NoteEditor variant="post" name="body" label="Your question" initialMarkdown={initial} defaultLanguage="java" />
    </form>,
  );
  const doc = await screen.findByRole('textbox', { name: 'Your question' });
  const sent = () => (view.container.querySelector('input[name="body"]') as HTMLInputElement).value;
  const toolbar = () => screen.getByRole('toolbar', { name: 'Formatting' });
  return { doc, sent, toolbar, form: screen.getByRole('form', { name: 'Ask' }) as HTMLFormElement };
}

describe('the post editor', () => {
  it('has the formatting a question needs and none of the lesson note’s extras', async () => {
    const { toolbar } = await setup();
    const labels = within(toolbar())
      .getAllByRole('button')
      .map((b) => b.getAttribute('aria-label'));
    expect(labels).toEqual([
      'Bold (Ctrl+B)',
      'Italic (Ctrl+I)',
      'Code in a sentence',
      'Link (Ctrl+K)',
      'Bulleted list',
      'Numbered list',
      'Code block',
      'Undo (Ctrl+Z)',
      'Redo (Ctrl+Shift+Z)',
    ]);
    expect(within(toolbar()).queryByRole('combobox', { name: 'Text style' })).toBeNull();
    expect(screen.queryByRole('button', { name: /Add code, a picture or a tip/ })).toBeNull();
  });

  it('adds a code block in the class’s language and sends Markdown under its own name', async () => {
    const { doc, sent, toolbar } = await setup('Why does this fail?');
    act(() => void fireEvent.keyDown(doc, { key: 'End' }));
    fireEvent.click(within(toolbar()).getByRole('button', { name: 'Code block' }));
    await waitFor(() => expect(sent()).toBe('```java\nWhy does this fail?\n```'));
  });

  it('takes no pictures: a pasted screenshot is left out', async () => {
    const { doc, sent } = await setup('Look:');
    const shot = new File(['x'], 'shot.png', { type: 'image/png' });
    fireEvent.paste(doc, { clipboardData: { files: [shot], getData: () => '' } });
    expect(doc.querySelector('img')).toBeNull();
    expect(sent()).toBe('Look:');
  });

  it('empties when the form is reset after posting', async () => {
    const { sent, form, doc, toolbar } = await setup('');
    fireEvent.click(within(toolbar()).getByRole('button', { name: 'Code block' }));
    await waitFor(() => expect(sent()).toContain('```java'));
    act(() => form.reset());
    await waitFor(() => expect(sent()).toBe(''));
    expect(doc.querySelector('pre')).toBeNull();
  });
});
