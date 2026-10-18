// Spike A (ADR-09) · FR-CODE-04: build the student page inside the preview origin; accept files only from the LMS.
import { describe, expect, it } from 'vitest';
import { acceptFilesMessage, buildPreviewDocument, MAX_PREVIEW_BYTES } from '../../preview/preview-doc.mjs';

const BRIDGE = '<script>/*bridge*/</script>';
const LMS = 'http://lms.localhost:3101';

describe('buildPreviewDocument', () => {
  const files = [
    { path: 'index.html', content: '<html><head><link rel="stylesheet" href="style.css"></head><body><script src="script.js"></script></body></html>' },
    { path: 'style.css', content: 'h1{color:red}' },
    { path: 'script.js', content: 'console.log("hi")' },
  ];

  it('inlines linked CSS and JS from the project files', () => {
    const doc = buildPreviewDocument(files, BRIDGE);
    expect(doc).toContain('<style>h1{color:red}</style>');
    expect(doc).toContain('<script>console.log("hi")</script>');
    expect(doc).not.toContain('href="style.css"');
  });

  it('puts the console bridge first in <head>, before student code', () => {
    const doc = buildPreviewDocument(files, BRIDGE);
    expect(doc.indexOf(BRIDGE)).toBeGreaterThan(-1);
    expect(doc.indexOf(BRIDGE)).toBeLessThan(doc.indexOf('console.log("hi")'));
  });

  it('leaves links to other websites alone', () => {
    const doc = buildPreviewDocument([{ path: 'index.html', content: '<link rel="stylesheet" href="https://cdn.example/x.css">' }], BRIDGE);
    expect(doc).toContain('href="https://cdn.example/x.css"');
  });

  it('cannot be broken out of by a </script> inside student JS', () => {
    const doc = buildPreviewDocument([
      { path: 'index.html', content: '<head></head><script src="a.js"></script>' },
      { path: 'a.js', content: 'var s = "</script><b>x</b>";' },
    ], BRIDGE);
    expect(doc).toContain('<\\/script><b>x</b>');
  });

  it('shows a friendly message when there is no index.html', () => {
    expect(buildPreviewDocument([{ path: 'a.js', content: '' }], BRIDGE)).toContain('Add an index.html file');
  });
});

describe('acceptFilesMessage', () => {
  const data = { __files: 1, files: [{ path: 'index.html', content: '<p>hi</p>' }] };

  it('accepts files sent by the LMS', () => {
    expect(acceptFilesMessage({ origin: LMS, data }, LMS)).toBe(true);
  });
  it('ignores the same message from any other origin', () => {
    expect(acceptFilesMessage({ origin: 'http://evil.localhost:3102', data }, LMS)).toBe(false);
    expect(acceptFilesMessage({ origin: 'null', data }, LMS)).toBe(false);
  });
  it('ignores messages that are not a file list', () => {
    expect(acceptFilesMessage({ origin: LMS, data: { hello: 1 } }, LMS)).toBe(false);
    expect(acceptFilesMessage({ origin: LMS, data: { __files: 1, files: [{ path: 1 }] } }, LMS)).toBe(false);
  });
  it('ignores projects that are too large', () => {
    const big = { __files: 1, files: [{ path: 'index.html', content: 'x'.repeat(MAX_PREVIEW_BYTES + 1) }] };
    expect(acceptFilesMessage({ origin: LMS, data: big }, LMS)).toBe(false);
  });
});
