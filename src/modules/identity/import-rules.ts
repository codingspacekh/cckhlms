// Reading a CSV of students (FR-AUTH-08). Pure: the service passes in the usernames and student names already in
// the club. Every problem names its line, so Admin can fix the spreadsheet and try again.
import { accountInputSchema, suggestUsername } from './rules';

export const MAX_IMPORT_ROWS = 300;
const COLUMNS = ['name', 'username', 'guardian name', 'guardian phone', 'notes'] as const;
type Column = (typeof COLUMNS)[number];
const ALIASES: Record<string, Column> = { 'full name': 'name', 'student name': 'name' };

// The header and one example row, for "Download the template". The BOM makes Excel open it as UTF-8.
export const IMPORT_TEMPLATE = '\uFEFFname,username,guardian name,guardian phone,notes\r\nBopha Lim,,Mr Lim,012 000 001,\r\n';

export type ImportRow = {
  line: number;
  name: string;
  username: string;
  suggested: boolean; // left blank in the file, so the LMS chose it
  guardianName?: string;
  guardianPhone?: string;
  notes?: string;
};
export type ImportCheck = { rows: ImportRow[]; errors: string[]; warnings: string[] };
export type ExistingAccounts = { usernames: Set<string>; students: Map<string, string> }; // lower-case name → username

class CsvError extends Error {}

// RFC 4180, plus what spreadsheets really write: a BOM, CRLF or LF, and semicolons where the header uses them.
// Each record keeps the line it starts on (a quoted value can span lines).
export function parseCsv(text: string): { line: number; cells: string[] }[] {
  const src = text.replace(/^\uFEFF/, '');
  const firstLine = src.split(/\r?\n/, 1)[0] ?? '';
  const sep = firstLine.includes(';') && !firstLine.includes(',') ? ';' : ',';
  const records: { line: number; cells: string[] }[] = [];
  let cells: string[] = [];
  let cell = '';
  let line = 1;
  let start = 1;
  let quoted = false;
  let quoteLine = 0;
  const endRecord = () => {
    cells.push(cell);
    records.push({ line: start, cells });
    cells = [];
    cell = '';
  };
  for (let i = 0; i < src.length; i++) {
    const ch = src[i]!;
    if (quoted) {
      if (ch === '"' && src[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else {
        if (ch === '\n') line++;
        cell += ch;
      }
    } else if (ch === '"' && cell === '') {
      quoted = true;
      quoteLine = line;
    } else if (ch === sep) {
      cells.push(cell);
      cell = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && src[i + 1] === '\n') i++;
      endRecord();
      line++;
      start = line;
    } else cell += ch;
  }
  if (quoted) throw new CsvError(`Line ${quoteLine}: a quoted value is never closed.`);
  if (cell !== '' || cells.length) endRecord();
  return records;
}

const headerName = (h: string) => h.trim().toLowerCase().replace(/[_-]+/g, ' ').replace(/\s+/g, ' ');
const nameKey = (n: string) => n.trim().toLowerCase().replace(/\s+/g, ' ');

export function checkImport(text: string, existing: ExistingAccounts): ImportCheck {
  const errors: string[] = [];
  const warnings: string[] = [];
  let records: ReturnType<typeof parseCsv>;
  try {
    records = parseCsv(text);
  } catch (err) {
    if (err instanceof CsvError) return { rows: [], errors: [err.message], warnings };
    throw err;
  }
  const isBlank = (cells: string[]) => cells.every((c) => c.trim() === '');
  const [header, ...body] = records.filter((r, i) => i === 0 || !isBlank(r.cells));
  if (!header || isBlank(header.cells)) return { rows: [], errors: ['The file is empty.'], warnings };

  const columns: Column[] = [];
  for (const raw of header.cells) {
    const h = headerName(raw);
    const col = ALIASES[h] ?? (COLUMNS as readonly string[]).find((c) => c === h);
    if (!col) return { rows: [], errors: [`Line 1: Unknown column “${raw.trim()}”. The columns are: ${COLUMNS.join(', ')}.`], warnings };
    if (columns.includes(col as Column)) return { rows: [], errors: [`Line 1: The column “${col}” appears twice.`], warnings };
    columns.push(col as Column);
  }
  if (!columns.includes('name'))
    return { rows: [], errors: ['Line 1: The first line needs the column names, with at least “name”.'], warnings };
  if (!body.length) return { rows: [], errors: ['The file has no students in it, only the column names.'], warnings };
  if (body.length > MAX_IMPORT_ROWS) return { rows: [], errors: [`Import at most ${MAX_IMPORT_ROWS} students at a time.`], warnings };

  // First pass: validate each line and collect the usernames the file asks for.
  type Parsed = { line: number; name: string; username?: string; guardianName?: string; guardianPhone?: string; notes?: string };
  const parsed: Parsed[] = [];
  const askedFor = new Map<string, number>(); // username → first line asking for it
  for (const r of body) {
    if (r.cells.length > columns.length) {
      errors.push(`Line ${r.line}: This line has ${r.cells.length} values, but there are ${columns.length} columns.`);
      continue;
    }
    const value = (c: Column) => r.cells[columns.indexOf(c)];
    const result = accountInputSchema.safeParse({
      role: 'student',
      name: value('name') ?? '',
      username: value('username'),
      guardianName: value('guardian name'),
      guardianPhone: value('guardian phone'),
      notes: value('notes'),
    });
    if (!result.success) {
      errors.push(`Line ${r.line}: ${result.error.issues[0]?.message ?? 'Check this line.'}`);
      continue;
    }
    const { name, username, guardianName, guardianPhone, notes } = result.data;
    if (username) {
      if (existing.usernames.has(username)) {
        errors.push(`Line ${r.line}: The username “${username}” is already taken.`);
        continue;
      }
      const earlier = askedFor.get(username);
      if (earlier) {
        errors.push(`Line ${r.line}: The username “${username}” is also on line ${earlier}.`);
        continue;
      }
      askedFor.set(username, r.line);
    }
    parsed.push({ line: r.line, name, username, guardianName, guardianPhone, notes });
  }

  // Second pass: suggest the blank usernames, avoiding the club's and every one the file asks for.
  const taken = new Set([...existing.usernames, ...askedFor.keys()]);
  const seenNames = new Map<string, number>();
  const rows: ImportRow[] = parsed.map((p) => {
    const username = p.username ?? suggestUsername(p.name, taken);
    taken.add(username);
    const key = nameKey(p.name);
    const inClub = existing.students.get(key);
    if (inClub)
      warnings.push(
        `Line ${p.line}: A student called ${p.name} already has an account (${inClub}). Leave this line out if it’s the same person.`,
      );
    const earlier = seenNames.get(key);
    if (earlier) warnings.push(`Line ${p.line}: ${p.name} is also on line ${earlier}.`);
    else seenNames.set(key, p.line);
    const row: ImportRow = { line: p.line, name: p.name, username, suggested: !p.username };
    if (p.guardianName) row.guardianName = p.guardianName;
    if (p.guardianPhone) row.guardianPhone = p.guardianPhone;
    if (p.notes) row.notes = p.notes;
    return row;
  });
  return { rows, errors, warnings };
}
