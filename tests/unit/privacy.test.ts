// NFR-07: guardian contact stays on the admin screens, and the rules for a student's data export and for deleting
// their personal data (anonymising: their marks stay, under "Deleted student").
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';
import { confirmsErase, DELETED_NAME, erasedEmail, exportFilename, scrubAuditDetail } from '@/modules/privacy/rules';

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sourceFiles(path);
    return /\.tsx?$/.test(name) ? [path] : [];
  });
}

describe('guardian contact (NFR-07)', () => {
  // Only these read or show it: the schema, account creation and CSV import, the People page, and the export.
  const ALLOWED = [
    'src/db/schema.ts',
    'src/modules/identity/service.ts',
    'src/modules/identity/actions.ts',
    'src/modules/identity/rules.ts',
    'src/modules/identity/import-rules.ts',
    'src/modules/identity/batches.ts',
    'src/modules/privacy/export.ts',
    'src/modules/privacy/erase.ts',
    'src/app/admin/people/PeopleManager.tsx',
    'src/app/admin/people/import/ImportStudents.tsx',
  ];

  it('is read only by admin code', () => {
    const root = process.cwd();
    const readers = sourceFiles(join(root, 'src'))
      .filter((f) => /guardian_?(name|phone)/i.test(readFileSync(f, 'utf8')))
      .map((f) => relative(root, f));
    expect(readers.length).toBeGreaterThan(5);
    expect(readers.filter((f) => !ALLOWED.includes(f))).toEqual([]);
    // Every allowed file outside the schema and the identity rules is an admin screen or admin-only service.
    for (const f of readers.filter((f) => f.startsWith('src/app/'))) expect(f).toMatch(/^src\/app\/admin\//);
  });
});

describe('the export file', () => {
  it('is named after the student and the day', () => {
    expect(exportFilename('bopha.l', '2026-10-21')).toBe('student-data-bopha.l-2026-10-21.json');
  });

  it('still has a name once the student’s data is deleted', () => {
    expect(exportFilename(null, '2026-10-21')).toBe('student-data-deleted-2026-10-21.json');
  });
});

describe('deleting a student’s personal data', () => {
  it('is confirmed by typing their username, however it is typed', () => {
    expect(confirmsErase('bopha.l', 'bopha.l')).toBe(true);
    expect(confirmsErase('  Bopha.L ', 'bopha.l')).toBe(true);
    expect(confirmsErase('bopha', 'bopha.l')).toBe(false);
    expect(confirmsErase('', 'bopha.l')).toBe(false);
    expect(confirmsErase('anything', null)).toBe(false);
  });

  it('leaves a name that says what happened, and an address nobody can receive', () => {
    expect(DELETED_NAME).toBe('Deleted student');
    expect(erasedEmail('u1')).toBe('u1@deleted.cckh.invalid');
  });

  it('takes names out of the audit details, and keeps the rest', () => {
    expect(scrubAuditDetail({ role: 'student', username: 'bopha.l', via: 'csv' })).toEqual({ role: 'student', via: 'csv' });
    expect(scrubAuditDetail({ name: 'Bopha Lim', score: 7 })).toEqual({ score: 7 });
    expect(scrubAuditDetail(null)).toBeNull();
    expect(scrubAuditDetail(['a'])).toEqual(['a']);
  });
});
