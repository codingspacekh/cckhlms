// FR-ADM-14 · M15a: an archived class says why. Closing its term archived it, or a promotion did, which can happen
// before the term ends, so it says when, by whom and how many moved on.
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { ArchivedNote } from '@/components/academics/ArchivedNote';

afterEach(cleanup);

describe('ArchivedNote', () => {
  it('says the term has ended for a class archived by closing its term', () => {
    render(<ArchivedNote termName="Term 4 · 2026" timeZone="Asia/Phnom_Penh" />);
    expect(screen.getByRole('note').textContent).toBe('Archived. Term 4 · 2026 has ended, so this class can be looked at but not changed.');
  });

  it('says who promoted a promoted class, when and how many moved on', () => {
    const promotion = { at: new Date('2026-10-30T18:30:00Z'), by: 'Club Admin', moved: 9, left: 1 };
    render(<ArchivedNote termName="Term 4 · 2026" timeZone="Asia/Phnom_Penh" promotion={promotion} />);
    expect(screen.getByRole('note').textContent).toBe(
      'Archived. Promoted on Sat 31 Oct 2026 by Club Admin: 9 moved on, 1 left the club. This class can be looked at but not changed.',
    );
  });
});
