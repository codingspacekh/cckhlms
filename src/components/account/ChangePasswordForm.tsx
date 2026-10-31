'use client';
// FR-AUTH-06 (M13, M16a): anyone changes their own password. The form empties after every try, so a
// password is never sent back to the page; a mistake is shown under the field it is about. On My account it is in a
// dialog (owner, 2026-11-01): onDone closes it, and onCancel is its Cancel.
import { useActionState } from 'react';
import { changeOwnPasswordAction } from '@/modules/identity/actions';
import type { FormResult } from '@/server/action-result';

const FIELDS = [
  { name: 'current', label: 'Current password', autoComplete: 'current-password' },
  {
    name: 'next',
    label: 'New password',
    autoComplete: 'new-password',
    help: 'At least 12 characters. A few words together are easy to remember.',
  },
  { name: 'again', label: 'New password again', autoComplete: 'new-password' },
] as const;

type Props = { forgotHint?: string; help?: string; onDone?: (message: string) => void; onCancel?: () => void };

export function ChangePasswordForm({ forgotHint, help: newHelp, onDone, onCancel }: Props) {
  const [result, formAction, saving] = useActionState(async (prev: FormResult | null, form: FormData) => {
    const r = await changeOwnPasswordAction(prev, form);
    if (r.ok && onDone) onDone(r.message ?? 'Password changed.');
    return r;
  }, null);
  const errorFor = (name: string) => (result && !result.ok && (result.field ?? 'current') === name ? result.error : null);
  return (
    <form className="stack narrow-form" action={formAction} aria-label="Change password">
      {result?.ok && !onDone && (
        <p className="note good" role="status">
          {result.message}
        </p>
      )}
      {FIELDS.map((f) => {
        const error = errorFor(f.name);
        const help = 'help' in f ? `pw-${f.name}-help` : null;
        const describedBy = [help, error ? `pw-${f.name}-err` : null].filter(Boolean).join(' ') || undefined;
        return (
          <div className="f" key={f.name}>
            <label htmlFor={`pw-${f.name}`}>{f.label}</label>
            <input
              id={`pw-${f.name}`}
              name={f.name}
              type="password"
              autoComplete={f.autoComplete}
              required
              minLength={f.name === 'current' ? undefined : 12}
              maxLength={128}
              aria-invalid={!!error}
              aria-describedby={describedBy}
            />
            {help && (
              <span id={help} className="xs muted field-help">
                {(f.name === 'next' && newHelp) || ('help' in f && f.help)}
              </span>
            )}
            {error && (
              <span id={`pw-${f.name}-err`} className="field-error">
                {error}
              </span>
            )}
          </div>
        );
      })}
      <div className={onCancel ? 'row end' : 'row'}>
        {onCancel && (
          <button type="button" className="btn ghost" onClick={onCancel}>
            Cancel
          </button>
        )}
        <button type="submit" className="btn primary" disabled={saving}>
          {saving ? 'Changing…' : 'Change password'}
        </button>
        {forgotHint && <span className="xs muted">{forgotHint}</span>}
      </div>
    </form>
  );
}
