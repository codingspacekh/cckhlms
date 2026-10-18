import type { ReactNode } from 'react';

export function Tile({ label, value, note }: { label: string; value: ReactNode; note?: ReactNode }) {
  return (
    <div className="card tile">
      <span className="k">{label}</span>
      <span className="v">{value}</span>
      {note && <span className="s">{note}</span>}
    </div>
  );
}
