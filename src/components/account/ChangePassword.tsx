'use client';
// FR-AUTH-06 (owner, 2026-11-01): on My account, for everyone, Change password is a button that opens the form in a
// dialog, like the other forms. A fresh, empty form each time; once changed, the dialog closes and the card says so.
import { useRef, useState } from 'react';
import { ChangePasswordForm } from './ChangePasswordForm';

export function ChangePassword({ help }: { help?: string }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [formKey, setFormKey] = useState(0);
  const [done, setDone] = useState<string | null>(null);
  return (
    <>
      {done && (
        <p className="note good" role="status">
          {done}
        </p>
      )}
      <div>
        <button
          type="button"
          className="btn"
          onClick={() => {
            setDone(null);
            setFormKey((k) => k + 1);
            dialog.current?.showModal();
          }}
        >
          Change password
        </button>
      </div>
      <dialog ref={dialog} className="dialog" aria-labelledby="password-dialog-title">
        <div className="stack">
          <h2 id="password-dialog-title">Change password</h2>
          {formKey > 0 && (
            <ChangePasswordForm
              key={formKey}
              help={help}
              onCancel={() => dialog.current?.close()}
              onDone={(message) => {
                setDone(message);
                dialog.current?.close();
              }}
            />
          )}
        </div>
      </dialog>
    </>
  );
}
