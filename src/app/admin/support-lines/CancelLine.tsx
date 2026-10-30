'use client';
import { useState, useTransition } from 'react';
import { cancelSupportLineAction } from '@/modules/support/actions';

// Cancelling asks once more: its students and teachers are told it is off.
export function CancelLine({ id, when }: { id: string; when: string }) {
  const [sure, setSure] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  if (error)
    return (
      <span className="small bad-text" role="alert">
        {error}
      </span>
    );
  return sure ? (
    <button
      type="button"
      className="btn sm"
      disabled={pending}
      onClick={() =>
        start(async () => {
          const r = await cancelSupportLineAction(id);
          if (!r.ok) setError(r.error);
        })
      }
    >
      Yes, cancel it
    </button>
  ) : (
    <button type="button" className="btn sm ghost" aria-label={`Cancel the support line on ${when}`} onClick={() => setSure(true)}>
      Cancel
    </button>
  );
}
