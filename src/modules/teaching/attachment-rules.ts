// Lesson attachment rules (FR-TCH-01, NFR-05). The served type comes from this list, never from the browser
// that uploaded the file, and only plain images are shown inline: an uploaded page or SVG can't run on the
// LMS's origin.

export const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024;
export const MAX_ATTACHMENTS_PER_LESSON = 10;

const TEXT = 'text/plain; charset=utf-8';
const TYPES: Record<string, { contentType: string; inline: boolean }> = {
  png: { contentType: 'image/png', inline: true },
  jpg: { contentType: 'image/jpeg', inline: true },
  jpeg: { contentType: 'image/jpeg', inline: true },
  gif: { contentType: 'image/gif', inline: true },
  webp: { contentType: 'image/webp', inline: true },
  pdf: { contentType: 'application/pdf', inline: false },
  zip: { contentType: 'application/zip', inline: false },
  docx: { contentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', inline: false },
  pptx: { contentType: 'application/vnd.openxmlformats-officedocument.presentationml.presentation', inline: false },
  xlsx: { contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', inline: false },
  ...Object.fromEntries(
    ['txt', 'md', 'csv', 'json', 'py', 'java', 'html', 'css', 'js'].map((x) => [x, { contentType: TEXT, inline: false }]),
  ),
  svg: { contentType: 'application/octet-stream', inline: false },
};

export function attachmentType(filename: string): { contentType: string; inline: boolean } | null {
  const m = /\.([a-z0-9]+)$/i.exec(filename);
  if (!m || filename.startsWith('.')) return null;
  return TYPES[m[1]!.toLowerCase()] ?? null;
}

// Just the file's own name: no folders, no control characters, at most 120 characters.
export function cleanFilename(raw: string): string {
  // eslint-disable-next-line no-control-regex
  const name = (raw.split(/[\\/]/).pop() ?? '').replace(/[\u0000-\u001f\u007f]/g, '').trim();
  if (!name) return 'file';
  if (name.length <= 120) return name;
  const ext = /\.[a-z0-9]{1,10}$/i.exec(name)?.[0] ?? '';
  return name.slice(0, 120 - ext.length) + ext;
}

const encodeRfc5987 = (s: string) => encodeURIComponent(s).replace(/['()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);

export function contentDisposition(filename: string, inline: boolean): string {
  const ascii = filename.replace(/[^\x20-\x7e]|["\\]/g, '_');
  return `${inline ? 'inline' : 'attachment'}; filename="${ascii}"; filename*=UTF-8''${encodeRfc5987(filename)}`;
}

export function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}
