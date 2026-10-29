// FR-ADM-13: the promotion wizard pre-selects each student's next class from their result, lets the admin change
// a whole group or one student, and confirms once. The result stays on screen after the page refreshes.
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { PromotionPlan } from '@/modules/promotion/promotion';
import { pickOption } from './select-helpers';

const refresh = vi.fn();
const promoteAction = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh }) }));
vi.mock('@/modules/promotion/actions', () => ({ promoteAction: (...a: unknown[]) => promoteAction(...a) }));
const { PromotionWizard } = await import('@/app/admin/classes/[id]/promote/PromotionWizard');

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const option = (id: string, name: string) => ({ id, name, courseName: '', termName: 'Term 2 · 2027', schedule: '', teacher: null });
const plan: PromotionPlan = {
  classId: 'c1',
  className: 'Python Level 1 · Sat 09:00',
  courseName: 'Python Level 1',
  termName: 'Term 1 · 2027',
  published: true,
  promotedAt: null,
  options: [option('l2', 'Python Level 2 · Sat 09:00'), option('r1', 'Python Level 1 · Sun 14:00'), option('w1', 'Web Basics · Sat 11:00')],
  defaults: { pass: 'l2', fail: 'r1' },
  students: [
    { enrolmentId: 'e1', studentId: 's1', name: 'Bopha Lim', score: 91.5, result: 'pass', target: 'l2' },
    { enrolmentId: 'e2', studentId: 's2', name: 'Chenda Ouk', score: 41.3, result: 'fail', target: 'r1' },
    { enrolmentId: 'e3', studentId: 's3', name: 'Kosal Meas', score: 84, result: 'pass', target: 'l2' },
  ],
};
const nextFor = (name: string) => screen.getByLabelText(`Next class for ${name}`) as HTMLButtonElement;

describe('PromotionWizard', () => {
  it('pre-selects the next-level class for passed students and the repeat class for the others', () => {
    render(<PromotionWizard plan={plan} />);
    expect(nextFor('Bopha Lim').value).toBe('l2');
    expect(nextFor('Chenda Ouk').value).toBe('r1');
    expect(screen.getByLabelText('Passed (2) move to')).toBeTruthy();
    expect(screen.getByLabelText('Not passed (1) move to')).toBeTruthy();
  });

  it('changes a whole group at once, and one student on their own', () => {
    render(<PromotionWizard plan={plan} />);
    pickOption(screen.getByLabelText('Passed (2) move to'), 'w1');
    expect([nextFor('Bopha Lim').value, nextFor('Kosal Meas').value, nextFor('Chenda Ouk').value]).toEqual(['w1', 'w1', 'r1']);
    pickOption(nextFor('Kosal Meas'), 'leave');
    expect(nextFor('Kosal Meas').value).toBe('leave');
  });

  it('asks for a choice for every student before confirming', () => {
    render(
      <PromotionWizard
        plan={{
          ...plan,
          defaults: { pass: 'l2', fail: null },
          students: plan.students.map((s) => (s.result === 'fail' ? { ...s, target: null } : s)),
        }}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Confirm promotion' }));
    expect(screen.getByRole('alert').textContent).toBe('Choose where Chenda Ouk goes next.');
    expect(promoteAction).not.toHaveBeenCalled();
  });

  it('sends every move, "leave" as no class, and keeps the result on screen after the refresh', async () => {
    promoteAction.mockResolvedValue({ ok: true, message: 'Done: 2 students moved on, 1 student leaves the club. The class is archived.' });
    const { rerender } = render(<PromotionWizard plan={plan} />);
    pickOption(nextFor('Kosal Meas'), 'leave');
    fireEvent.click(screen.getByRole('button', { name: 'Confirm promotion' }));
    await waitFor(() => expect(refresh).toHaveBeenCalled());
    expect(promoteAction).toHaveBeenCalledWith('c1', [
      { enrolmentId: 'e1', toClassId: 'l2' },
      { enrolmentId: 'e2', toClassId: 'r1' },
      { enrolmentId: 'e3', toClassId: null },
    ]);
    rerender(<PromotionWizard plan={{ ...plan, promotedAt: new Date() }} />); // what router.refresh() brings back
    expect(screen.getByRole('status').textContent).toBe('Done: 2 students moved on, 1 student leaves the club. The class is archived.');
    expect(screen.queryByRole('button', { name: 'Confirm promotion' })).toBeNull();
  });

  it('shows an error from the server and changes nothing on screen', async () => {
    promoteAction.mockResolvedValue({ ok: false, error: 'Bopha Lim is already in Python Level 2 · Sat 09:00.' });
    render(<PromotionWizard plan={plan} />);
    fireEvent.click(screen.getByRole('button', { name: 'Confirm promotion' }));
    expect((await screen.findByRole('alert')).textContent).toBe('Bopha Lim is already in Python Level 2 · Sat 09:00.');
    expect(refresh).not.toHaveBeenCalled();
  });

  it('asks for the term reports to be published first', () => {
    render(<PromotionWizard plan={{ ...plan, published: false }} />);
    expect(screen.getByRole('note').textContent).toContain('term reports first');
    expect(screen.queryByRole('button', { name: 'Confirm promotion' })).toBeNull();
  });
});
