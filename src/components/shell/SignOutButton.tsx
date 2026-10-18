'use client';
import { useState } from 'react';
import { Icon } from '@/components/ui/Icon';

export function SignOutButton() {
  const [busy, setBusy] = useState(false);
  async function signOut() {
    setBusy(true);
    await fetch('/api/auth/sign-out', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' });
    window.location.assign('/login');
  }
  return (
    <button type="button" className="btn ghost sm" onClick={signOut} disabled={busy} aria-label="Sign out" title="Sign out">
      <Icon name="logout" />
    </button>
  );
}
