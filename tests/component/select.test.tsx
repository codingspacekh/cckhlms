// The club's own drop-down (owner, 2026-10-29: no plain browser lists). It takes <option> and <optgroup> children like
// <select>, sends its value under `name`, and works from the keyboard like a select-only combobox.
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Select } from '@/components/ui/Select';

afterEach(cleanup);

const Course = (props: Partial<Parameters<typeof Select>[0]>) => (
  <form aria-label="Form">
    <label className="f">
      Course
      <Select name="courseId" defaultValue="" required {...props}>
        <option value="" disabled>
          Choose a course
        </option>
        <option value="py1">PY1 · Python Level 1</option>
        <option value="py2">PY2 · Python Level 2</option>
        <option value="jv1" disabled>
          JV1 · Java Level 1
        </option>
        <option value="web">WEB · Web Basics</option>
      </Select>
    </label>
  </form>
);
const field = () => screen.getByRole('combobox', { name: /Course/ });
const sent = () => new FormData(screen.getByRole('form', { name: 'Form' }) as HTMLFormElement).get('courseId');
const list = () => screen.getByRole('listbox');

describe('Select', () => {
  it('shows the placeholder, opens its own list from the label, and sends the chosen value', () => {
    render(<Course />);
    expect(field().textContent).toBe('Choose a course');
    expect(sent()).toBe('');
    fireEvent.click(screen.getByText('Course'));
    expect(field().getAttribute('aria-expanded')).toBe('true');
    const options = within(list()).getAllByRole('option');
    expect(options.map((o) => o.textContent)).toEqual([
      'Choose a course',
      'PY1 · Python Level 1',
      'PY2 · Python Level 2',
      'JV1 · Java Level 1',
      'WEB · Web Basics',
    ]);
    expect(options[3]!.getAttribute('aria-disabled')).toBe('true');
    fireEvent.click(within(list()).getByRole('option', { name: 'PY2 · Python Level 2' }));
    expect(screen.queryByRole('listbox')).toBeNull();
    expect(field().textContent).toBe('PY2 · Python Level 2');
    expect((field() as HTMLButtonElement).value).toBe('py2');
    expect(sent()).toBe('py2');
  });

  it('marks the chosen option, and a disabled one cannot be picked', () => {
    render(<Course defaultValue="py1" />);
    fireEvent.click(field());
    expect(within(list()).getByRole('option', { name: 'PY1 · Python Level 1' }).getAttribute('aria-selected')).toBe('true');
    fireEvent.click(within(list()).getByRole('option', { name: 'JV1 · Java Level 1' }));
    expect(sent()).toBe('py1');
  });

  it('works from the keyboard: arrows skip disabled options, Enter picks, Escape closes without picking', () => {
    render(<Course defaultValue="py2" />);
    fireEvent.keyDown(field(), { key: 'ArrowDown' });
    expect(document.activeElement?.textContent).toBe('PY2 · Python Level 2');
    fireEvent.keyDown(document.activeElement!, { key: 'ArrowDown' });
    expect(document.activeElement?.textContent).toBe('WEB · Web Basics'); // JV1 is skipped
    fireEvent.keyDown(document.activeElement!, { key: 'Enter' });
    expect(sent()).toBe('web');
    expect(document.activeElement).toBe(field());
    fireEvent.keyDown(field(), { key: 'Enter' });
    fireEvent.keyDown(document.activeElement!, { key: 'Home' });
    expect(document.activeElement?.textContent).toBe('PY1 · Python Level 1'); // the placeholder can't be chosen
    fireEvent.keyDown(document.activeElement!, { key: 'Escape' });
    expect(screen.queryByRole('listbox')).toBeNull();
    expect(sent()).toBe('web');
  });

  it('jumps to an option by typing its first letters', () => {
    render(<Course />);
    fireEvent.click(field());
    fireEvent.keyDown(document.activeElement!, { key: 'w' });
    expect(document.activeElement?.textContent).toBe('WEB · Web Basics');
  });

  it('can be controlled, and calls onChange with the new value', () => {
    const onChange = vi.fn();
    function Weeks() {
      const [weeks, setWeeks] = useState(12);
      return (
        <label className="f">
          Weeks
          <Select
            name="weeks"
            value={weeks}
            onChange={(e) => {
              onChange(e.target.value);
              setWeeks(Number(e.target.value));
            }}
          >
            {[10, 11, 12].map((w) => (
              <option key={w} value={w}>
                {w}
              </option>
            ))}
          </Select>
        </label>
      );
    }
    render(<Weeks />);
    const weeks = screen.getByRole('combobox', { name: /Weeks/ });
    expect(weeks.textContent).toBe('12');
    fireEvent.click(weeks);
    fireEvent.click(screen.getByRole('option', { name: '10' }));
    expect(onChange).toHaveBeenCalledWith('10');
    expect(weeks.textContent).toBe('10');
  });

  it('shows option groups with their names', () => {
    render(
      <label className="f">
        Class
        <Select defaultValue="">
          <option value="">Don’t enrol them yet</option>
          <optgroup label="Term 1 · 2027">
            <option value="c1">Python Level 1 · Sat 09:00</option>
          </optgroup>
        </Select>
      </label>,
    );
    fireEvent.click(screen.getByRole('combobox', { name: /Class/ }));
    const group = screen.getByRole('group', { name: 'Term 1 · 2027' });
    expect(within(group).getByRole('option').textContent).toBe('Python Level 1 · Sat 09:00');
  });

  it('goes back to its first value when the form is reset, and can be switched off', () => {
    const { rerender } = render(<Course defaultValue="py1" />);
    fireEvent.click(field());
    fireEvent.click(screen.getByRole('option', { name: 'WEB · Web Basics' }));
    fireEvent.reset(screen.getByRole('form', { name: 'Form' }));
    expect(sent()).toBe('py1');
    rerender(<Course defaultValue="py1" disabled />);
    expect((field() as HTMLButtonElement).disabled).toBe(true);
  });

  it('like a required <select>, stops the form being sent until something is chosen', () => {
    const onSubmit = vi.fn((e: { preventDefault: () => void }) => e.preventDefault());
    render(
      <form aria-label="Form" onSubmit={onSubmit}>
        <label className="f">
          Course
          <Select name="courseId" defaultValue="" required>
            <option value="" disabled>
              Choose a course
            </option>
            <option value="py1">PY1 · Python Level 1</option>
          </Select>
        </label>
        <button type="submit">Save</button>
      </form>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(onSubmit).not.toHaveBeenCalled();
    expect(screen.getByRole('listbox')).toBeTruthy();
    fireEvent.click(screen.getByRole('option', { name: 'PY1 · Python Level 1' }));
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(onSubmit).toHaveBeenCalledTimes(1);
  });

  it('closes on Escape without closing the dialog around it', () => {
    const onCancel = vi.fn();
    render(
      <div onKeyDown={(e) => e.key === 'Escape' && onCancel()}>
        <Course />
      </div>,
    );
    fireEvent.click(field());
    fireEvent.keyDown(document.activeElement!, { key: 'Escape' });
    expect(onCancel).not.toHaveBeenCalled();
  });
});
