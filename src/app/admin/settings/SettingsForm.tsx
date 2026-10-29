'use client';
import { useActionState } from 'react';
import { updateSettingsAction } from '@/modules/club/actions';
import type { ClubSettings } from '@/modules/club/service';
import { Select } from '@/components/ui/Select';

export function SettingsForm({ settings, timeZones }: { settings: ClubSettings; timeZones: string[] }) {
  const [result, formAction, saving] = useActionState(updateSettingsAction, null);
  return (
    <form className="card stack narrow-form" action={formAction} aria-label="Club settings">
      <label className="f">
        Club name
        <input name="clubName" type="text" defaultValue={settings.clubName} required maxLength={100} />
      </label>
      <label className="f">
        Time zone <span className="xs muted">(all class times and due dates use this)</span>
        <Select name="timeZone" defaultValue={settings.timeZone}>
          {timeZones.map((tz) => (
            <option key={tz} value={tz}>
              {tz}
            </option>
          ))}
        </Select>
      </label>
      <label className="f">
        Signed by <span className="xs muted">(the name on the signature line of certificates)</span>
        <input name="certificateSigner" type="text" defaultValue={settings.certificateSigner} required maxLength={100} />
      </label>
      {result?.ok && (
        <p className="note" role="status">
          {result.message}
        </p>
      )}
      {result && !result.ok && (
        <p className="note bad" role="alert">
          {result.error}
        </p>
      )}
      <div>
        <button type="submit" className="btn primary" disabled={saving}>
          {saving ? 'Saving…' : 'Save settings'}
        </button>
      </div>
    </form>
  );
}
