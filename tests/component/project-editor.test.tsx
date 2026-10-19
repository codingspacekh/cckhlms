// FR-CODE-02/03: the multi-file editor around the code area: open files, upload files or a .zip, download a
// .zip, the Java package warning, and which changes are saved at once. CodeMirror itself runs in the e2e.
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { strToU8, unzipSync, zipSync } from 'fflate';
import { forwardRef, useImperativeHandle } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// A stand-in for CodeMirror: a textarea per open file, with the same props and handle.
vi.mock('@/components/editor/CodeArea', () => ({
  CodeArea: forwardRef(function FakeCodeArea(
    p: { path: string; doc: string; resetKey: number; onChange: (path: string, text: string) => void },
    ref,
  ) {
    useImperativeHandle(ref, () => ({ replaceDoc: (text: string) => p.onChange(p.path, text) }));
    return (
      <textarea
        aria-label={`Code for ${p.path}`}
        key={`${p.path}:${p.resetKey}`}
        defaultValue={p.doc}
        onChange={(e) => p.onChange(p.path, e.target.value)}
      />
    );
  }),
}));
const { ProjectEditor } = await import('@/components/editor/ProjectEditor');

const java = [
  { path: 'src/com/club/shapes/Main.java', content: 'package com.club.shapes;\nclass Main {}' },
  { path: 'src/com/club/shapes/Square.java', content: 'package com.club.shape;\nclass Square {}' },
];
// jsdom's Blob has no arrayBuffer()/text(), which every browser has; read them through FileReader instead.
const read = (b: Blob, as: 'readAsArrayBuffer' | 'readAsText') =>
  new Promise<unknown>((resolve) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r[as](b);
  });
Blob.prototype.arrayBuffer ??= function (this: Blob) {
  return read(this, 'readAsArrayBuffer') as Promise<ArrayBuffer>;
};
Blob.prototype.text ??= function (this: Blob) {
  return read(this, 'readAsText') as Promise<string>;
};

let blobs: Blob[] = [];
beforeEach(() => {
  blobs = [];
  URL.createObjectURL = vi.fn((b: Blob) => (blobs.push(b), 'blob:x'));
  URL.revokeObjectURL = vi.fn();
});
afterEach(() => cleanup());
const fileOf = (name: string, data: Uint8Array | string) =>
  new File([typeof data === 'string' ? data : (data as BlobPart)], name, {
    type: name.endsWith('.zip') ? 'application/zip' : 'text/plain',
  });
const upload = async (...files: File[]) => {
  await act(async () => {
    fireEvent.change(screen.getByLabelText('Upload files or .zip'), { target: { files } });
  });
};

describe('ProjectEditor', () => {
  it('opens Main.java first, and warns about a package that doesn’t match its folder, with a fix', () => {
    const onChange = vi.fn();
    render(<ProjectEditor initial={java} nonce="n" zipName="shapes" java onChange={onChange} />);
    expect(screen.getByLabelText('Code for src/com/club/shapes/Main.java')).toBeTruthy();
    expect(screen.queryByTestId('package-warning')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Square.java' }));
    expect(screen.getByTestId('package-warning').textContent).toContain('but its folder means package com.club.shapes;');
    fireEvent.click(screen.getByRole('button', { name: 'Change to package com.club.shapes;' }));
    expect(onChange).toHaveBeenLastCalledWith(
      expect.arrayContaining([{ path: 'src/com/club/shapes/Square.java', content: 'package com.club.shapes;\nclass Square {}' }]),
      true, // the fix is saved at once
    );
    expect(screen.queryByTestId('package-warning')).toBeNull();
  });

  it('typing waits; new files are saved at once', () => {
    const onChange = vi.fn();
    render(<ProjectEditor initial={[{ path: 'main.py', content: '' }]} nonce="n" zipName="p" onChange={onChange} />);
    fireEvent.change(screen.getByLabelText('Code for main.py'), { target: { value: 'print(1)' } });
    expect(onChange).toHaveBeenLastCalledWith([{ path: 'main.py', content: 'print(1)' }], false);
    fireEvent.click(screen.getByRole('button', { name: 'New file' }));
    fireEvent.change(screen.getByLabelText('File name'), { target: { value: 'util.py' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add' }));
    expect(onChange).toHaveBeenLastCalledWith(
      [
        { path: 'main.py', content: 'print(1)' },
        { path: 'util.py', content: '' },
      ],
      true,
    );
    expect(screen.getByLabelText('Code for util.py')).toBeTruthy();
  });

  it('renames and deletes files', () => {
    const onChange = vi.fn();
    render(
      <ProjectEditor
        initial={[
          { path: 'main.py', content: 'a' },
          { path: 'util.py', content: 'b' },
        ]}
        nonce="n"
        zipName="p"
        onChange={onChange}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Rename main.py' }));
    fireEvent.change(screen.getByLabelText('File name'), { target: { value: 'game.py' } });
    fireEvent.click(screen.getByRole('button', { name: 'Rename' }));
    expect(onChange).toHaveBeenLastCalledWith(
      [
        { path: 'game.py', content: 'a' },
        { path: 'util.py', content: 'b' },
      ],
      true,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Delete game.py' }));
    fireEvent.click(screen.getByRole('button', { name: 'Yes, delete game.py' }));
    expect(onChange).toHaveBeenLastCalledWith([{ path: 'util.py', content: 'b' }], true);
    expect(screen.getByLabelText('Code for util.py')).toBeTruthy();
  });

  it('downloads the project as a .zip with its name', async () => {
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    render(<ProjectEditor initial={java} nonce="n" zipName="shapes-bopha.l" java />);
    fireEvent.click(screen.getByRole('button', { name: 'Download .zip' }));
    expect(click).toHaveBeenCalled();
    expect((click.mock.contexts[0] as HTMLAnchorElement).download).toBe('shapes-bopha.l.zip');
    const zip = unzipSync(new Uint8Array(await blobs[0]!.arrayBuffer()));
    expect(Object.keys(zip).sort()).toEqual(java.map((f) => f.path));
    click.mockRestore();
  });

  it('opens a .zip in place of the project, and refuses an unsafe one', async () => {
    const onChange = vi.fn();
    render(<ProjectEditor initial={java} nonce="n" zipName="p" java onChange={onChange} />);
    await upload(fileOf('evil.zip', zipSync({ '../evil.py': strToU8('x') })));
    expect((await screen.findByRole('alert')).textContent).toMatch(/outside the project folder/);
    expect(onChange).not.toHaveBeenCalled();

    await upload(fileOf('game.zip', zipSync({ 'game/main.py': strToU8('print(1)'), 'game/util.py': strToU8('') })));
    await waitFor(() => expect(screen.getByRole('status').textContent).toBe('Opened game.zip: 2 files.'));
    expect(onChange).toHaveBeenLastCalledWith(
      [
        { path: 'main.py', content: 'print(1)' },
        { path: 'util.py', content: '' },
      ],
      true,
    );
    expect(screen.getByLabelText('Code for main.py')).toBeTruthy();
  });

  it('adds single files at the top, replacing one with the same name, within the limits', async () => {
    const onChange = vi.fn();
    render(<ProjectEditor initial={[{ path: 'main.py', content: 'old' }]} nonce="n" zipName="p" onChange={onChange} />);
    await upload(fileOf('main.py', 'new'), fileOf('helper.py', 'h'));
    await waitFor(() => expect(screen.getByRole('status').textContent).toBe('Added main.py, helper.py.'));
    expect(onChange).toHaveBeenLastCalledWith(
      [
        { path: 'main.py', content: 'new' },
        { path: 'helper.py', content: 'h' },
      ],
      true,
    );
    await upload(fileOf('virus.exe', 'MZ'));
    await waitFor(() => expect(screen.getByRole('alert').textContent).toMatch(/code and text files/));
  });

  it('read-only: no upload or file changes, but the .zip can be downloaded', () => {
    render(<ProjectEditor initial={java} nonce="n" zipName="p" java readOnly />);
    expect(screen.queryByLabelText('Upload files or .zip')).toBeNull();
    expect(screen.queryByRole('button', { name: 'New file' })).toBeNull();
    expect(screen.queryByTestId('package-warning')).toBeNull();
    expect(screen.getByRole('button', { name: 'Download .zip' })).toBeTruthy();
  });
});
