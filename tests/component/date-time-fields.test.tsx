// The date and time pickers: a calendar or a list of times to choose from, or type straight into the field. The
// form still sends 'YYYY-MM-DD' and 'HH:MM' under the field's name, like the browser's own inputs did.
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DateField, TimeField } from '@/components/ui/DateTimeFields';

afterEach(cleanup);

const sent = (form: HTMLFormElement, name: string) => new FormData(form).get(name);
const inForm = (ui: React.ReactNode) => {
  render(<form aria-label="F">{ui}</form>);
  return screen.getByRole('form', { name: 'F' }) as HTMLFormElement;
};

describe('DateField', () => {
  it('shows the date in words and sends it as YYYY-MM-DD', () => {
    const form = inForm(<DateField label="First day" name="startDate" defaultValue="2028-01-08" />);
    expect((screen.getByLabelText('First day') as HTMLInputElement).value).toBe('Sat 8 Jan 2028');
    expect(sent(form, 'startDate')).toBe('2028-01-08');
  });

  it('opens a calendar on the selected month and picks a day', () => {
    const form = inForm(<DateField label="First day" name="startDate" defaultValue="2028-01-08" />);
    fireEvent.click(screen.getByRole('button', { name: 'Open calendar' }));
    const cal = screen.getByRole('dialog', { name: 'Choose a date' });
    expect(within(cal).getByText('January 2028')).toBeTruthy();
    expect(within(cal).getByRole('button', { name: 'Saturday 8 January 2028' }).getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(within(cal).getByRole('button', { name: 'Next month' }));
    expect(within(cal).getByText('February 2028')).toBeTruthy();
    fireEvent.click(within(cal).getByRole('button', { name: 'Saturday 12 February 2028' }));
    expect(screen.queryByRole('dialog', { name: 'Choose a date' })).toBeNull();
    expect(sent(form, 'startDate')).toBe('2028-02-12');
    expect((screen.getByLabelText('First day') as HTMLInputElement).value).toBe('Sat 12 Feb 2028');
  });

  it('moves through the days with the arrow keys and closes with Escape', () => {
    inForm(<DateField label="Due day" name="dueDate" defaultValue="2028-01-31" />);
    fireEvent.click(screen.getByRole('button', { name: 'Open calendar' }));
    const cal = screen.getByRole('dialog', { name: 'Choose a date' });
    expect(document.activeElement?.getAttribute('aria-label')).toBe('Monday 31 January 2028');
    fireEvent.keyDown(document.activeElement!, { key: 'ArrowRight' });
    expect(document.activeElement?.getAttribute('aria-label')).toBe('Tuesday 1 February 2028');
    expect(within(cal).getByText('February 2028')).toBeTruthy();
    fireEvent.keyDown(document.activeElement!, { key: 'Escape' });
    expect(screen.queryByRole('dialog', { name: 'Choose a date' })).toBeNull();
    expect(document.activeElement).toBe(screen.getByLabelText('Due day'));
  });

  it('accepts a typed date, and says so when it cannot read one', () => {
    const form = inForm(<DateField label="From" name="from" />);
    const input = screen.getByLabelText('From') as HTMLInputElement;
    fireEvent.change(input, { target: { value: '12/2/2028' } });
    expect(sent(form, 'from')).toBe('2028-02-12');
    fireEvent.blur(input);
    expect(input.value).toBe('Sat 12 Feb 2028');
    fireEvent.change(input, { target: { value: '30 Feb 2028' } });
    expect(input.validationMessage).toBe('Type a date like 8 Jan 2028, or choose one from the calendar.');
    expect(input.getAttribute('aria-invalid')).toBe('true');
  });

  it('an optional date can be cleared; a required one cannot', () => {
    const form = inForm(<DateField label="Due day" name="dueDate" defaultValue="2028-01-31" />);
    fireEvent.click(screen.getByRole('button', { name: 'Open calendar' }));
    fireEvent.click(screen.getByRole('button', { name: 'Clear' }));
    expect(sent(form, 'dueDate')).toBe('');
    cleanup();
    inForm(<DateField label="Day" name="d" required />);
    fireEvent.click(screen.getByRole('button', { name: 'Open calendar' }));
    expect(screen.queryByRole('button', { name: 'Clear' })).toBeNull();
    expect((screen.getByLabelText('Day') as HTMLInputElement).required).toBe(true);
  });

  it('works as a controlled field', () => {
    const onChange = vi.fn();
    function Host() {
      const [v, setV] = useState('');
      return (
        <DateField
          label="First session"
          name="firstDate"
          value={v}
          onChange={(d) => {
            setV(d);
            onChange(d);
          }}
        />
      );
    }
    const form = inForm(<Host />);
    fireEvent.change(screen.getByLabelText('First session'), { target: { value: '2027-01-09' } });
    expect(onChange).toHaveBeenLastCalledWith('2027-01-09');
    expect(sent(form, 'firstDate')).toBe('2027-01-09');
  });

  it('goes back to its first value when the form is reset', () => {
    const form = inForm(<DateField label="Joins on" name="enrolledOn" defaultValue="2028-01-08" />);
    fireEvent.change(screen.getByLabelText('Joins on'), { target: { value: '2028-03-01' } });
    fireEvent.reset(form);
    expect(sent(form, 'enrolledOn')).toBe('2028-01-08');
    expect((screen.getByLabelText('Joins on') as HTMLInputElement).value).toBe('Sat 8 Jan 2028');
  });

  it('belongs to the form named by its form attribute', () => {
    render(
      <>
        <form id="lesson" aria-label="Lesson" />
        <DateField label="Publish on" name="publishDate" form="lesson" defaultValue="2027-01-30" />
      </>,
    );
    expect(sent(screen.getByRole('form', { name: 'Lesson' }) as HTMLFormElement, 'publishDate')).toBe('2027-01-30');
  });
});

describe('TimeField', () => {
  it('lists times every 15 minutes and picks one', () => {
    const form = inForm(<TimeField label="Start time" name="startTime" defaultValue="09:00" />);
    expect((screen.getByLabelText('Start time') as HTMLInputElement).value).toBe('09:00');
    fireEvent.click(screen.getByRole('button', { name: 'Open time list' }));
    const list = screen.getByRole('dialog', { name: 'Choose a time' });
    expect(within(list).getAllByRole('button')).toHaveLength(96);
    expect(within(list).getByRole('button', { name: '09:00' }).getAttribute('aria-pressed')).toBe('true');
    expect(document.activeElement?.textContent).toBe('09:00');
    fireEvent.keyDown(document.activeElement!, { key: 'ArrowDown' });
    expect(document.activeElement?.textContent).toBe('09:15');
    fireEvent.click(within(list).getByRole('button', { name: '14:30' }));
    expect(sent(form, 'startTime')).toBe('14:30');
    expect(screen.queryByRole('dialog', { name: 'Choose a time' })).toBeNull();
  });

  it('accepts any typed time, such as 17:50 or 2pm', () => {
    const form = inForm(<TimeField label="Due time" name="dueTime" />);
    const input = screen.getByLabelText('Due time') as HTMLInputElement;
    fireEvent.change(input, { target: { value: '17:50' } });
    expect(sent(form, 'dueTime')).toBe('17:50');
    fireEvent.change(input, { target: { value: '2pm' } });
    fireEvent.blur(input);
    expect(input.value).toBe('14:00');
    expect(sent(form, 'dueTime')).toBe('14:00');
    fireEvent.change(input, { target: { value: '25:00' } });
    expect(input.validationMessage).toBe('Type a time like 14:30, or choose one from the list.');
  });
});

describe('opening and closing', () => {
  it('before the page script runs, the browser’s own input stands in (plain GET forms work)', async () => {
    const { renderToString } = await import('react-dom/server');
    const html = renderToString(<DateField label="From" name="from" defaultValue="2027-04-01" />);
    expect(html).toContain('type="date"');
    expect(html).toContain('name="from"');
    expect(html).toContain('value="2027-04-01"');
    expect(renderToString(<TimeField label="At" name="t" value="10:30" />)).toContain('type="time"');
  });

  it('opens from the keyboard, toggles with its button and closes on a click elsewhere', () => {
    inForm(<DateField label="Day" name="d" defaultValue="2028-01-08" />);
    const input = screen.getByLabelText('Day');
    fireEvent.keyDown(input, { key: 'ArrowDown' });
    expect(document.activeElement?.getAttribute('aria-label')).toBe('Saturday 8 January 2028');
    fireEvent.click(screen.getByRole('button', { name: 'Open calendar' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    fireEvent.click(input);
    expect(screen.getByRole('dialog', { name: 'Choose a date' })).toBeTruthy();
    expect(document.activeElement).toBe(input); // a click to type keeps the caret in the field
    fireEvent.keyDown(input, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).toBeNull();
    fireEvent.click(input);
    fireEvent.pointerDown(document.body);
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('closes when focus moves on past the calendar', () => {
    render(
      <>
        <DateField label="Day" name="d" />
        <button type="button">Next</button>
      </>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Open calendar' }));
    fireEvent.blur(screen.getByRole('button', { name: 'Today' }), { relatedTarget: screen.getByRole('button', { name: 'Next' }) });
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('a tap on a phone opens the calendar without the on-screen keyboard', () => {
    inForm(<DateField label="Day" name="d" />);
    const tap = new Event('pointerdown', { bubbles: true, cancelable: true });
    Object.assign(tap, { pointerType: 'touch' });
    fireEvent(screen.getByLabelText('Day'), tap);
    expect(tap.defaultPrevented).toBe(true);
    expect(screen.getByRole('dialog', { name: 'Choose a date' })).toBeTruthy();
  });
});

describe('calendar keys and buttons', () => {
  const focused = () => document.activeElement?.getAttribute('aria-label');
  const press = (key: string) => fireEvent.keyDown(document.activeElement!, { key });

  it('pages by month (keeping the day, or the month’s last day), and jumps to the week’s ends', () => {
    inForm(<DateField label="Day" name="d" defaultValue="2028-01-31" />);
    fireEvent.click(screen.getByRole('button', { name: 'Open calendar' }));
    press('PageDown');
    expect(focused()).toBe('Tuesday 29 February 2028');
    press('PageUp');
    expect(focused()).toBe('Saturday 29 January 2028');
    press('Home');
    expect(focused()).toBe('Monday 24 January 2028');
    press('End');
    expect(focused()).toBe('Sunday 30 January 2028');
    press('ArrowUp');
    expect(focused()).toBe('Sunday 23 January 2028');
    press('ArrowDown');
    press('ArrowLeft');
    expect(focused()).toBe('Saturday 29 January 2028');
    press('x');
    expect(focused()).toBe('Saturday 29 January 2028');
  });

  it('shows the previous month, and picks today', () => {
    const form = inForm(<DateField label="Day" name="d" defaultValue="2028-01-08" />);
    fireEvent.click(screen.getByRole('button', { name: 'Open calendar' }));
    fireEvent.click(screen.getByRole('button', { name: 'Previous month' }));
    expect(screen.getByText('December 2027')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Today' }));
    const d = new Date();
    const today = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    expect(sent(form, 'd')).toBe(today);
  });
});

describe('time list keys', () => {
  it('moves up and down and to either end; a typed time off the 15-minute steps is in the list too', () => {
    inForm(<TimeField label="At" name="t" defaultValue="17:50" />);
    fireEvent.click(screen.getByRole('button', { name: 'Open time list' }));
    const list = screen.getByRole('dialog', { name: 'Choose a time' });
    expect(within(list).getAllByRole('button')).toHaveLength(97);
    expect(document.activeElement?.textContent).toBe('17:50');
    fireEvent.keyDown(document.activeElement!, { key: 'ArrowUp' });
    expect(document.activeElement?.textContent).toBe('17:45');
    fireEvent.keyDown(document.activeElement!, { key: 'End' });
    expect(document.activeElement?.textContent).toBe('23:45');
    fireEvent.keyDown(document.activeElement!, { key: 'ArrowDown' });
    expect(document.activeElement?.textContent).toBe('23:45');
    fireEvent.keyDown(document.activeElement!, { key: 'Home' });
    expect(document.activeElement?.textContent).toBe('00:00');
  });

  it('starts at the morning when no time is set yet', () => {
    inForm(<TimeField label="At" name="t" />);
    fireEvent.keyDown(screen.getByLabelText('At'), { key: 'ArrowDown' });
    expect(document.activeElement?.textContent).toBe('09:00');
  });
});
