import type { ReactNode } from 'react';

// Wide tables scroll sideways on small screens; the region is focusable so keyboard users can scroll it too.
export function TableScroll({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="tw" role="region" aria-label={label} tabIndex={0}>
      {children}
    </div>
  );
}
