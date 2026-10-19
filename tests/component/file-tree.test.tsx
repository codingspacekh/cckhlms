// FR-CODE-02: the editor's file tree: folders, open a file, add, rename and delete files.
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { FileTree } from '@/components/editor/FileTree';

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const paths = ['src/com/club/Main.java', 'src/com/club/Square.java', 'README.md'];
const handlers = () => ({ onOpen: vi.fn(), onAdd: vi.fn(), onRename: vi.fn(), onDelete: vi.fn() });

describe('FileTree', () => {
  it('shows folders with their files, and opens a file', () => {
    const h = handlers();
    render(<FileTree paths={paths} current="src/com/club/Main.java" {...h} />);
    const tree = screen.getByRole('navigation', { name: 'Files' });
    expect([...tree.querySelectorAll('li')].map((li) => li.textContent)).toEqual([
      'README.md',
      'src/',
      'com/',
      'club/',
      'Main.java',
      'Square.java',
    ]);
    expect(within(tree).getByRole('button', { name: 'Main.java' }).getAttribute('aria-current')).toBe('true');
    fireEvent.click(within(tree).getByRole('button', { name: 'Square.java' }));
    expect(h.onOpen).toHaveBeenCalledWith('src/com/club/Square.java');
  });

  it('adds a file in a folder, and explains a bad name', () => {
    const h = handlers();
    render(<FileTree paths={paths} current="README.md" {...h} />);
    fireEvent.click(screen.getByRole('button', { name: 'New file' }));
    const form = screen.getByRole('form', { name: 'New file' });
    fireEvent.change(within(form).getByLabelText('File name'), { target: { value: 'src/com/club/square.java' } });
    fireEvent.click(within(form).getByRole('button', { name: 'Add' }));
    expect(within(form).getByRole('alert').textContent).toBe('There is already a file called src/com/club/square.java.');
    fireEvent.change(within(form).getByLabelText('File name'), { target: { value: 'src/com/club/Circle.java' } });
    fireEvent.click(within(form).getByRole('button', { name: 'Add' }));
    expect(h.onAdd).toHaveBeenCalledWith('src/com/club/Circle.java');
    expect(screen.queryByRole('form', { name: 'New file' })).toBeNull();
  });

  it('renames the open file', () => {
    const h = handlers();
    render(<FileTree paths={paths} current="README.md" {...h} />);
    fireEvent.click(screen.getByRole('button', { name: 'Rename README.md' }));
    const form = screen.getByRole('form', { name: 'Rename file' });
    const input = within(form).getByLabelText('File name') as HTMLInputElement;
    expect(input.value).toBe('README.md');
    fireEvent.change(input, { target: { value: 'notes/README.md' } });
    fireEvent.click(within(form).getByRole('button', { name: 'Rename' }));
    expect(h.onRename).toHaveBeenCalledWith('README.md', 'notes/README.md');
  });

  it('deletes the open file after a second click, but never the last one', () => {
    const h = handlers();
    const { rerender } = render(<FileTree paths={paths} current="README.md" {...h} />);
    fireEvent.click(screen.getByRole('button', { name: 'Delete README.md' }));
    expect(h.onDelete).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Yes, delete README.md' }));
    expect(h.onDelete).toHaveBeenCalledWith('README.md');
    rerender(<FileTree paths={['main.py']} current="main.py" {...h} />);
    expect((screen.getByRole('button', { name: 'Delete main.py' }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('read-only: files can be opened but not changed', () => {
    render(<FileTree paths={paths} current="README.md" readOnly {...handlers()} />);
    expect(screen.queryByRole('button', { name: 'New file' })).toBeNull();
    expect(screen.queryByRole('button', { name: /Rename|Delete/ })).toBeNull();
  });
});
