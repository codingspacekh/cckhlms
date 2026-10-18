'use client';
import { useState, type FormEvent } from 'react';

const MESSAGES: Record<number, string> = {
  401: 'Wrong username or password.',
  429: 'Too many attempts. Wait a minute and try again.',
};

export function LoginForm() {
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    setBusy(true);
    setError(null);
    const res = await fetch('/api/auth/sign-in/username', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ username: String(form.get('username') ?? '').trim(), password: String(form.get('password') ?? '') }),
    });
    if (res.ok) {
      window.location.assign('/');
      return;
    }
    setBusy(false);
    setError(MESSAGES[res.status] ?? 'Sign-in failed. Please try again.');
  }

  return (
    <form className="stack" onSubmit={submit} noValidate>
      <label className="f">
        Username
        <input name="username" type="text" autoComplete="username" autoCapitalize="none" spellCheck={false} required />
      </label>
      <label className="f">
        Password
        <input name="password" type="password" autoComplete="current-password" required />
      </label>
      {error && (
        <p className="note bad" role="alert">
          {error}
        </p>
      )}
      <button className="btn primary" type="submit" disabled={busy}>
        {busy ? 'Signing in…' : 'Sign in'}
      </button>
    </form>
  );
}
