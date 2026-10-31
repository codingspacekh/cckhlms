'use client';
// "New support line" (FR-ADM-18) opens the form in a dialog, like the other "add" buttons (owner, 2026-10-31). The
// students ticked on Weekly reports, Change and Copy for another day open it straight away; closing it then goes
// back to the plain list, so the next New support line starts empty. Saving it goes back to the list too.
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState, type ComponentProps } from 'react';
import { SupportLineForm } from '@/components/support/SupportLineForm';

type Props = Omit<ComponentProps<typeof SupportLineForm>, 'onCancel' | 'titleId'> & { startOpen?: boolean };

export function NewSupportLine({ startOpen = false, ...form }: Props) {
  const router = useRouter();
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
        New support line
      </button>
      <dialog
        ref={dialog}
        className="dialog xwide"
        aria-labelledby="support-line-title"
        onClose={() => {
          if (startOpen) router.replace('/admin/support-lines', { scroll: false });
        }}
      >
        {formKey > 0 && <SupportLineForm key={formKey} {...form} titleId="support-line-title" onCancel={() => dialog.current?.close()} />}
      </dialog>
    </>
  );
}
