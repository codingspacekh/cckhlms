// FR-AUTH-08: reading a CSV of students. Errors name the line, so Admin can fix the spreadsheet; one bad row means
// nothing is imported (the service refuses unless the check has no errors).
import { describe, expect, it } from 'vitest';
import { checkImport, IMPORT_TEMPLATE, MAX_IMPORT_ROWS, parseCsv } from '@/modules/identity/import-rules';

const none = { usernames: new Set<string>(), students: new Map<string, string>() };
const csv = (...lines: string[]) => lines.join('\n');

describe('parseCsv', () => {
  it('reads quoted values with commas, quotes and line breaks, and numbers each record by the line it starts on', () => {
    const records = parseCsv('\uFEFFname,notes\r\n"Lim, Bopha","Says ""hi"""\r\nChenda Ouk,"two\nlines"\r\nKosal Meas,\r\n');
    expect(records).toEqual([
      { line: 1, cells: ['name', 'notes'] },
      { line: 2, cells: ['Lim, Bopha', 'Says "hi"'] },
      { line: 3, cells: ['Chenda Ouk', 'two\nlines'] },
      { line: 5, cells: ['Kosal Meas', ''] },
    ]);
  });

  it('reads semicolons when the header uses them (Excel in some languages)', () => {
    expect(parseCsv('name;guardian phone\nBopha Lim;012 345 678')).toEqual([
      { line: 1, cells: ['name', 'guardian phone'] },
      { line: 2, cells: ['Bopha Lim', '012 345 678'] },
    ]);
  });

  it('says where a quote is never closed', () => {
    expect(() => parseCsv('name\nBopha Lim\n"Chenda Ouk\nKosal Meas')).toThrow('Line 3: a quoted value is never closed.');
  });
});

describe('checkImport', () => {
  it('suggests usernames for blank ones, keeps the ones given, and reads headers loosely', () => {
    const r = checkImport(
      csv('Full Name,Username,Guardian_Name,GUARDIAN PHONE,Notes', 'Bopha Lim,,Mr Lim,012 345 678,', 'Chenda Ouk,Chenda.O,,,Shy'),
      none,
    );
    expect(r.errors).toEqual([]);
    expect(r.rows).toEqual([
      { line: 2, name: 'Bopha Lim', username: 'bopha.l', suggested: true, guardianName: 'Mr Lim', guardianPhone: '012 345 678' },
      { line: 3, name: 'Chenda Ouk', username: 'chenda.o', suggested: false, notes: 'Shy' },
    ]);
  });

  it('writes names in any script as they are, and gives them a username', () => {
    const r = checkImport(csv('name', 'សុខ ចាន់', 'Nguyễn Văn An'), none);
    expect(r.errors).toEqual([]);
    expect(r.rows.map((x) => [x.name, x.username])).toEqual([
      ['សុខ ចាន់', 'user1'],
      ['Nguyễn Văn An', 'nguyen.a'],
    ]);
  });

  it('does not suggest a username that is taken in the club or given later in the file', () => {
    const r = checkImport(csv('name,username', 'Bopha Lim,', 'Bopha Long,', 'Someone Else,bopha.l3'), {
      usernames: new Set(['bopha.l']),
      students: new Map(),
    });
    expect(r.rows.map((x) => x.username)).toEqual(['bopha.l2', 'bopha.l4', 'bopha.l3']);
  });

  it('reports every problem with its line number', () => {
    const r = checkImport(
      csv(
        'name,username,guardian phone',
        'Bopha Lim,bopha.l,012',
        ',,012',
        'Chenda Ouk,taken.one,',
        'Kosal Meas,bopha.l,',
        'Dara Pen,Bad Name!,',
        'Mony Ly,mony.l,012,extra',
        'Sokha Pich,,0123456789012345678901234567890',
      ),
      { usernames: new Set(['taken.one']), students: new Map() },
    );
    expect(r.errors).toEqual([
      "Line 3: Enter the person's full name.",
      'Line 4: The username “taken.one” is already taken.',
      'Line 5: The username “bopha.l” is also on line 2.',
      'Line 6: Use lower-case letters, digits, dots or underscores (not at the start or end).',
      'Line 7: This line has 4 values, but there are 3 columns.',
      'Line 8: Guardian phone is too long.',
    ]);
  });

  it('skips blank lines', () => {
    const r = checkImport(csv('name', '', 'Bopha Lim', ' , ', ''), none);
    expect(r.errors).toEqual([]);
    expect(r.rows).toHaveLength(1);
  });

  it('warns, without refusing, about a name already in the club or twice in the file', () => {
    const r = checkImport(csv('name', 'Bopha Lim', 'Chenda Ouk', 'chenda ouk'), {
      usernames: new Set(['bopha.l']),
      students: new Map([['bopha lim', 'bopha.l']]),
    });
    expect(r.errors).toEqual([]);
    expect(r.warnings).toEqual([
      'Line 2: A student called Bopha Lim already has an account (bopha.l). Leave this line out if it’s the same person.',
      'Line 4: chenda ouk is also on line 3.',
    ]);
  });

  it('needs a header row with a name column and no unknown columns', () => {
    expect(checkImport(csv('username', 'bopha.l'), none).errors).toEqual([
      'Line 1: The first line needs the column names, with at least “name”.',
    ]);
    expect(checkImport(csv('name,phone', 'Bopha Lim,012'), none).errors).toEqual([
      'Line 1: Unknown column “phone”. The columns are: name, username, guardian name, guardian phone, notes.',
    ]);
    expect(checkImport(csv('name,Name', 'a,b'), none).errors).toEqual(['Line 1: The column “name” appears twice.']);
  });

  it('refuses an empty file and a very long one', () => {
    expect(checkImport('', none).errors).toEqual(['The file is empty.']);
    expect(checkImport('name\n\n', none).errors).toEqual(['The file has no students in it, only the column names.']);
    const long = ['name', ...Array.from({ length: MAX_IMPORT_ROWS + 1 }, (_, i) => `Student ${i}`)].join('\n');
    expect(checkImport(long, none).errors).toEqual([`Import at most ${MAX_IMPORT_ROWS} students at a time.`]);
  });

  it('turns a broken quote into an error rather than a crash', () => {
    expect(checkImport('name\n"Bopha', none).errors).toEqual(['Line 2: a quoted value is never closed.']);
  });

  it('has a template that passes its own check', () => {
    const r = checkImport(IMPORT_TEMPLATE, none);
    expect(r.errors).toEqual([]);
    expect(r.rows.length).toBeGreaterThan(0);
  });
});
