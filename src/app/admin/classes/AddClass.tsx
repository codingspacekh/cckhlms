'use client';
// "New class" (FR-ADM-05) opens the class form, with its preview of every session, in a wide dialog, like the other
// "add" buttons (owner, 2026-10-31). Creating the class opens its page. /admin/classes?new=1 opens it straight away.
import { useEffect, useRef, useState, type ComponentProps } from 'react';
import { NewClassForm } from './new/NewClassForm';

export function AddClass({ startOpen = false, ...form }: ComponentProps<typeof NewClassForm> & { startOpen?: boolean }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [formKey, setFormKey] = useState(startOpen ? 1 : 0); // a fresh form each time
  useEffect(() => {
    if (startOpen) dialog.current?.showModal();
  }, [startOpen]);
  return (
    <>
      <button
        type="button"
        className="btn primary"
        onClick={() => {
          setFormKey((k) => k + 1);
          dialog.current?.showModal();
        }}
      >
        New class
      </button>
      <dialog ref={dialog} className="dialog xwide" aria-labelledby="new-class-title">
        <div className="spread">
          <h2 id="new-class-title">New weekend class</h2>
          <button type="button" className="btn ghost" onClick={() => dialog.current?.close()}>
            Close
          </button>
        </div>
        {formKey > 0 && <NewClassForm key={formKey} {...form} />}
      </dialog>
    </>
  );
}
