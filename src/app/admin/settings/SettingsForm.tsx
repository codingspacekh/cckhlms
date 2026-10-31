'use client';
import { useActionState } from 'react';
import { updateSettingsAction } from '@/modules/club/actions';
import type { ClubSettings } from '@/modules/club/service';
import { Select } from '@/components/ui/Select';

export function SettingsForm({ settings, timeZones }: { settings: ClubSettings; timeZones: string[] }) {
  const [result, formAction, saving] = useActionState(updateSettingsAction, null);
  return (
    <form className="card stack" action={formAction} aria-label="Club settings">
      {/* One row per setting: what it is and what it changes, then its field (owner, 2026-10-31: the full width). */}
      <div className="setting-rows">
        <div className="setting-row">
          <div>
            <label htmlFor="set-club-name" className="strong">
              Club name
            </label>
            <p className="xs muted">On the sidebar, login slips and certificates.</p>
          </div>
          <input id="set-club-name" name="clubName" type="text" defaultValue={settings.clubName} required maxLength={100} />
        </div>
        <div className="setting-row">
          <div>
            <label htmlFor="set-time-zone" className="strong">
              Time zone
            </label>
            <p className="xs muted">All class times and due dates use this.</p>
          </div>
          <Select id="set-time-zone" name="timeZone" defaultValue={settings.timeZone}>
            {timeZones.map((tz) => (
              <option key={tz} value={tz}>
                {tz}
              </option>
            ))}
          </Select>
        </div>
        <div className="setting-row">
          <div>
            <label htmlFor="set-signer" className="strong">
              Signed by
            </label>
            <p className="xs muted">The name on the signature line of certificates.</p>
          </div>
          <input id="set-signer" name="certificateSigner" type="text" defaultValue={settings.certificateSigner} required maxLength={100} />
        </div>
      </div>
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
      <div className="row end">
        <button type="submit" className="btn primary" disabled={saving}>
          {saving ? 'Saving…' : 'Save settings'}
        </button>
      </div>
    </form>
  );
}
