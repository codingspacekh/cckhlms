// FR-ADM-16: the club settings form.
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

const updateSettingsAction = vi.fn();
vi.mock('@/modules/club/actions', () => ({ updateSettingsAction: (...a: unknown[]) => updateSettingsAction(...a) }));
const { SettingsForm } = await import('@/app/admin/settings/SettingsForm');

afterEach(() => {
  cleanup();
  updateSettingsAction.mockReset();
});
const settings = { clubName: 'CCKH Coding Club', timeZone: 'Asia/Phnom_Penh' };
const zones = ['Asia/Bangkok', 'Asia/Phnom_Penh'];

describe('SettingsForm', () => {
  it('starts with the saved club name and time zone', () => {
    render(<SettingsForm settings={settings} timeZones={zones} />);
    expect((screen.getByLabelText('Club name') as HTMLInputElement).value).toBe('CCKH Coding Club');
    expect((screen.getByLabelText(/Time zone/) as HTMLSelectElement).value).toBe('Asia/Phnom_Penh');
  });

  it('sends the form and confirms when saved', async () => {
    updateSettingsAction.mockResolvedValue({ ok: true, message: 'Settings saved.' });
    render(<SettingsForm settings={settings} timeZones={zones} />);
    fireEvent.change(screen.getByLabelText('Club name'), { target: { value: 'CCKH Weekend Club' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save settings' }));
    expect((await screen.findByRole('status')).textContent).toBe('Settings saved.');
    const form = updateSettingsAction.mock.calls[0]![1] as FormData;
    expect(form.get('clubName')).toBe('CCKH Weekend Club');
    expect(form.get('timeZone')).toBe('Asia/Phnom_Penh');
  });

  it('shows the problem when saving fails', async () => {
    updateSettingsAction.mockResolvedValue({ ok: false, error: 'Choose a time zone from the list.' });
    render(<SettingsForm settings={settings} timeZones={zones} />);
    fireEvent.click(screen.getByRole('button', { name: 'Save settings' }));
    expect((await screen.findByRole('alert')).textContent).toBe('Choose a time zone from the list.');
  });
});
