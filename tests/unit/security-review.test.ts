// NFR-05 (M7): the ASVS Level 1 review in docs/security-review.md. Every checklist row has a status (Met, N/A or
// Action) and evidence, and every Action says why it is left.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const doc = readFileSync(join(process.cwd(), 'docs/security-review.md'), 'utf8');
// The rows of the "Item | Status | Evidence" tables.
const rows = doc
  .split('\n')
  .filter((l) => l.startsWith('| ') && !l.startsWith('| Item') && !l.startsWith('| Scan'))
  .map((l) => l.split('|').map((c) => c.trim()))
  .filter((c) => c.length === 5)
  .map(([, item, status, evidence]) => ({ item: item!, status: status!, evidence: evidence! }));

describe('the ASVS Level 1 review', () => {
  it('covers each chapter that applies', () => {
    for (const chapter of ['V1 ', 'V2 ', 'V3 ', 'V4 ', 'V5 ', 'V7 ', 'V8 ', 'V9', 'V12 ', 'V13']) expect(doc, chapter).toContain(chapter);
    expect(rows.length).toBeGreaterThan(30);
  });

  it('gives every row a status and its evidence', () => {
    for (const r of rows) {
      expect(r.status, r.item).toMatch(/^(Met|N\/A|Action( \(.+\))?)$/);
      expect(r.evidence.length, r.item).toBeGreaterThan(30);
    }
  });

  it('records the ZAP baseline with no high-risk alert', () => {
    const scans = doc.split('\n').filter((l) => /^\| (Anonymous|Admin|Teacher|Student) \|/.test(l));
    expect(scans).toHaveLength(4);
    for (const s of scans) expect(s.split('|')[3]!.trim()).toBe('**0**');
  });
});
