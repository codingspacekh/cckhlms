import type { ReactNode } from 'react';

export function Tile({ label, value, note, children }: { label: string; value: ReactNode; note?: ReactNode; children?: ReactNode }) {
  return (
    <div className="card tile">
      <span className="k">{label}</span>
      <span className={typeof value === 'string' ? 'v text' : 'v'}>{value}</span>
      {children}
      {note && <span className="s">{note}</span>}
    </div>
  );
}
