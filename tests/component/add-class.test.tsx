// FR-ADM-05 (owner, 2026-10-31): "New class" opens the class form in a dialog, like the other "add" buttons, and a
// link to /admin/classes?new=1 (the old /admin/classes/new) opens it straight away.
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

vi.mock('@/modules/academics/class-actions', () => ({ createClassAction: vi.fn() }));
const { AddClass } = await import('@/app/admin/classes/AddClass');

beforeAll(() => {
  HTMLDialogElement.prototype.showModal = function () {
    this.setAttribute('open', '');
  };
  HTMLDialogElement.prototype.close = function () {
    this.removeAttribute('open');
    this.dispatchEvent(new Event('close'));
  };
});
afterEach(cleanup);

const props = {
  courses: [{ id: 'c1', label: 'PY1 · Python Level 1' }],
  terms: [{ id: 't1', name: 'Term 1 · 2028', startDate: '2028-01-08', endDate: '2028-04-01' }],
  teachers: [{ id: 'u1', name: 'Sophea Chan' }],
};

describe('AddClass', () => {
  it('opens the new class form in a dialog, and closes it', () => {
    render(<AddClass {...props} />);
    expect(screen.queryByRole('form', { name: 'New class' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'New class' }));
    const dialog = screen.getByRole('dialog', { name: 'New weekend class' });
    expect(within(dialog).getByRole('form', { name: 'New class' })).toBeTruthy();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Close' }));
    expect(screen.queryByRole('dialog', { name: 'New weekend class' })).toBeNull();
  });

  it('is open straight away when asked to be', () => {
    render(<AddClass {...props} startOpen />);
    expect(within(screen.getByRole('dialog', { name: 'New weekend class' })).getByRole('form', { name: 'New class' })).toBeTruthy();
  });
});
