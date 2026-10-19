// FR-TCH-01 · NFR-05: lesson attachments. Only known file types, safe names, and nothing an uploaded file
// can run on the LMS's own origin.
import { describe, expect, it } from 'vitest';
import { attachmentType, cleanFilename, contentDisposition, formatSize, MAX_ATTACHMENT_BYTES } from '@/modules/teaching/attachment-rules';

describe('attachmentType', () => {
  it('accepts the files teachers share, case-insensitively', () => {
    for (const name of ['notes.pdf', 'loops.PY', 'Main.java', 'starter.zip', 'diagram.png', 'photo.JPG', 'slides.pptx', 'data.csv'])
      expect(attachmentType(name), name).not.toBeNull();
  });

  it('shows plain images inline; everything else downloads as a file', () => {
    expect(attachmentType('diagram.png')).toEqual({ contentType: 'image/png', inline: true });
    expect(attachmentType('photo.jpeg')).toEqual({ contentType: 'image/jpeg', inline: true });
    expect(attachmentType('notes.pdf')).toEqual({ contentType: 'application/pdf', inline: false });
    expect(attachmentType('loops.py')).toEqual({ contentType: 'text/plain; charset=utf-8', inline: false });
  });

  it('never serves HTML, SVG or scripts in a way the browser would run them', () => {
    for (const name of ['page.html', 'logo.svg', 'app.js']) {
      const t = attachmentType(name);
      expect(t?.inline, name).toBe(false);
      expect(t?.contentType, name).not.toMatch(/html|svg|javascript/);
    }
  });

  it('refuses unknown and executable types, and names without an extension', () => {
    for (const name of ['setup.exe', 'run.bat', 'script.sh', 'notes.py.exe', 'README', '.env', 'archive.tar.gz.app'])
      expect(attachmentType(name), name).toBeNull();
  });

  it('allows files up to 10 MB', () => {
    expect(MAX_ATTACHMENT_BYTES).toBe(10 * 1024 * 1024);
  });
});

describe('cleanFilename', () => {
  it('keeps only the name, without folders or control characters', () => {
    expect(cleanFilename('../../etc/passwd.txt')).toBe('passwd.txt');
    expect(cleanFilename('C:\\Users\\sophea\\Week 3.pdf')).toBe('Week 3.pdf');
    expect(cleanFilename('bad\u0000name\n.py')).toBe('badname.py');
    expect(cleanFilename('  spaced .pdf  ')).toBe('spaced .pdf');
  });

  it('shortens long names but keeps the extension', () => {
    const name = cleanFilename(`${'a'.repeat(300)}.pdf`);
    expect(name.length).toBe(120);
    expect(name.endsWith('.pdf')).toBe(true);
  });

  it('falls back to a plain name when nothing is left', () => {
    expect(cleanFilename('/')).toBe('file');
  });
});

describe('contentDisposition', () => {
  it('names the download, with a plain fallback and the full UTF-8 name', () => {
    expect(contentDisposition('Week 3.pdf', false)).toBe(`attachment; filename="Week 3.pdf"; filename*=UTF-8''Week%203.pdf`);
    expect(contentDisposition('រៀន "loops".png', true)).toBe(
      `inline; filename="___ _loops_.png"; filename*=UTF-8''%E1%9E%9A%E1%9F%80%E1%9E%93%20%22loops%22.png`,
    );
    expect(contentDisposition("Bopha's (v2).py", false)).toBe(
      `attachment; filename="Bopha's (v2).py"; filename*=UTF-8''Bopha%27s%20%28v2%29.py`,
    );
  });
});

describe('formatSize', () => {
  it('reads like a file manager', () => {
    expect(formatSize(11)).toBe('11 B');
    expect(formatSize(2_458)).toBe('2.4 KB');
    expect(formatSize(1_048_576)).toBe('1.0 MB');
    expect(formatSize(10 * 1024 * 1024)).toBe('10.0 MB');
  });
});
