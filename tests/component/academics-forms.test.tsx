// FR-ADM-04: course and syllabus forms; wide tables stay keyboard-scrollable.
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

const createCourseAction = vi.fn();
const updateCourseAction = vi.fn();
const setSyllabusAction = vi.fn();
vi.mock('@/modules/academics/actions', () => ({
  createCourseAction: (...a: unknown[]) => createCourseAction(...a),
  updateCourseAction: (...a: unknown[]) => updateCourseAction(...a),
  setSyllabusAction: (...a: unknown[]) => setSyllabusAction(...a),
}));
const { CourseForm } = await import('@/app/admin/courses/CourseForm');
const { SyllabusForm } = await import('@/app/admin/courses/[id]/SyllabusForm');
const { TableScroll } = await import('@/components/ui/TableScroll');

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('CourseForm', () => {
  it('adds a course with the default pass mark and weights, and no next-level choice', async () => {
    createCourseAction.mockResolvedValue({ ok: true, message: 'PY1 added.' });
    render(<CourseForm />);
    expect(screen.getByRole('form', { name: 'Add a course' })).toBeTruthy();
    expect(screen.queryByLabelText(/Next level/)).toBeNull();
    expect((screen.getByLabelText('Pass mark') as HTMLInputElement).value).toBe('60');
    fireEvent.change(screen.getByLabelText('Code'), { target: { value: 'PY1' } });
    fireEvent.change(screen.getByLabelText('Course name'), { target: { value: 'Python Level 1' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add course' }));
    expect((await screen.findByRole('status')).textContent).toBe('PY1 added.');
    const form = createCourseAction.mock.calls[0]![1] as FormData;
    expect([form.get('weightExam'), form.get('weightClasswork'), form.get('weightHomework')]).toEqual(['60', '30', '10']);
    expect(updateCourseAction).not.toHaveBeenCalled();
  });

  it('edits a course: shows its values, offers other courses as the next level, and reports errors', async () => {
    updateCourseAction.mockResolvedValue({ ok: false, error: 'That would make a loop of next levels.' });
    render(
      <CourseForm
        course={{
          id: 'c1',
          code: 'PY1',
          name: 'Python Level 1',
          defaultLanguage: 'python',
          passMark: 50,
          weightExam: 50,
          weightClasswork: 40,
          weightHomework: 10,
          nextCourseId: null,
        }}
        others={[{ id: 'c2', code: 'PY2', name: 'Python Level 2' }]}
      />,
    );
    expect((screen.getByLabelText('Pass mark') as HTMLInputElement).value).toBe('50');
    expect(screen.getByRole('option', { name: 'PY2 · Python Level 2' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Save course' }));
    expect((await screen.findByRole('alert')).textContent).toBe('That would make a loop of next levels.');
    expect((updateCourseAction.mock.calls[0]![1] as FormData).get('courseId')).toBe('c1');
  });
});

describe('SyllabusForm', () => {
  it('shows the topics as a numbered list and saves the text', async () => {
    setSyllabusAction.mockResolvedValue({ ok: true, message: 'Syllabus saved: 2 topics.' });
    render(<SyllabusForm courseId="c1" topics={['Output with print()', 'Variables & input()']} />);
    expect(screen.getAllByRole('listitem').map((li) => li.textContent)).toEqual(['Output with print()', 'Variables & input()']);
    expect((screen.getByLabelText('Topics, one per line') as HTMLTextAreaElement).value).toBe('Output with print()\nVariables & input()');
    fireEvent.click(screen.getByRole('button', { name: 'Save syllabus' }));
    expect((await screen.findByRole('status')).textContent).toBe('Syllabus saved: 2 topics.');
    expect((setSyllabusAction.mock.calls[0]![1] as FormData).get('courseId')).toBe('c1');
  });

  it('shows the problem when the syllabus is refused', async () => {
    setSyllabusAction.mockResolvedValue({ ok: false, error: 'A syllabus can have at most 60 topics.' });
    render(<SyllabusForm courseId="c1" topics={[]} />);
    expect(screen.queryByRole('list')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Save syllabus' }));
    expect((await screen.findByRole('alert')).textContent).toBe('A syllabus can have at most 60 topics.');
  });
});

describe('TableScroll', () => {
  it('is a labelled region that keyboard users can focus and scroll', () => {
    render(
      <TableScroll label="Courses table">
        <table>
          <tbody>
            <tr>
              <td>x</td>
            </tr>
          </tbody>
        </table>
      </TableScroll>,
    );
    const region = screen.getByRole('region', { name: 'Courses table' });
    expect(region.getAttribute('tabindex')).toBe('0');
  });
});
