'use client';
// Profile pictures (owner, 2026-10-31) on My account: the person's gradient until they choose a picture (PNG, JPEG or
// WebP, up to 5 MB), which the browser makes into a small square before it's sent; Remove goes back to the gradient.
import { useRouter } from 'next/navigation';
import { useId, useState, useTransition } from 'react';
import { MAX_AVATAR_BYTES } from '@/lib/avatar';
import { squarePicture } from '@/lib/avatar-square';
import { removeAvatarAction } from '@/modules/identity/avatar-actions';
import { Avatar } from './Avatar';

const TYPES = ['image/png', 'image/jpeg', 'image/webp'];

export function ProfilePicture({ userId, image }: { userId: string; image: string | null }) {
  const router = useRouter();
  const id = useId();
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, start] = useTransition();

  function choose(f: File | undefined) {
    setResult(null);
    if (!f) return;
    if (!TYPES.includes(f.type)) return setResult({ ok: false, text: 'Use a PNG, JPEG or WebP picture.' });
    if (f.size > MAX_AVATAR_BYTES) return setResult({ ok: false, text: 'That picture is bigger than 5 MB.' });
    start(async () => {
      try {
        const body = new FormData();
        body.set('picture', await squarePicture(f), 'picture');
        const res = await fetch('/api/account/avatar', { method: 'POST', body });
        const r = (await res.json()) as { ok: boolean; error?: string };
        if (!r.ok) return setResult({ ok: false, text: r.error ?? 'That picture couldn’t be saved.' });
        setResult({ ok: true, text: 'Your picture is saved.' });
        router.refresh();
      } catch {
        setResult({ ok: false, text: 'That picture couldn’t be opened. Try another one.' });
      }
    });
  }

  function remove() {
    setResult(null);
    start(async () => {
      const r = await removeAvatarAction();
      setResult(r.ok ? { ok: true, text: r.message ?? 'Removed.' } : { ok: false, text: r.error });
      if (r.ok) router.refresh();
    });
  }

  return (
    <div className="profile-picture">
      <Avatar userId={userId} image={image} className="av xl" testId="avatar-preview" />
      <div className="stack-sm">
        <div className="row">
          <label htmlFor={`${id}-pic`} className="btn">
            {busy ? 'Saving…' : image ? 'Change picture' : 'Choose a picture'}
          </label>
          <input
            id={`${id}-pic`}
            type="file"
            accept={TYPES.join(',')}
            className="sr-only"
            aria-label="Choose a picture"
            disabled={busy}
            onChange={(e) => {
              choose(e.target.files?.[0]);
              e.target.value = '';
            }}
          />
          {image && (
            <button type="button" className="btn ghost" onClick={remove} disabled={busy}>
              Remove picture
            </button>
          )}
        </div>
        <p className="xs muted">A PNG, JPEG or WebP picture, up to 5 MB. Only you and the club’s teachers see it.</p>
        {result && (
          <p className={`note ${result.ok ? '' : 'bad'}`} role={result.ok ? 'status' : 'alert'}>
            {result.text}
          </p>
        )}
      </div>
    </div>
  );
}
