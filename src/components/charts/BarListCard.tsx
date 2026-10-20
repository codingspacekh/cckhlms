'use client';
// Horizontal bars with their value written beside each one, so nothing needs hovering; a tick marks the pass mark.
import { ChartCard } from './ChartCard';
import { fmt } from './format';

export type BarItem = { label: string; sub?: string; value: number | null };

export function BarListCard({
  title,
  subtitle,
  items,
  unit = '%',
  valueHead,
  refValue,
  refLabel,
  empty = 'Nothing to show yet.',
}: {
  title: string;
  subtitle?: string;
  items: BarItem[];
  unit?: string;
  valueHead: string;
  refValue?: number;
  refLabel?: string;
  empty?: string;
}) {
  const table = { head: ['Item', valueHead], rows: items.map((i) => [i.sub ? `${i.label} (${i.sub})` : i.label, fmt(i.value, unit)]) };
  return (
    <ChartCard title={title} subtitle={subtitle} table={table} empty={items.length === 0 && empty}>
      <div className="hbars">
        {items.map((it, i) => (
          <div className="hbar" key={i} data-value={it.value === null ? undefined : String(it.value)}>
            <span className="l">
              {it.label}
              {it.sub && <span className="muted xs"> {it.sub}</span>}
            </span>
            <span className="val">{fmt(it.value, unit)}</span>
            <div className="track" aria-hidden="true">
              <div className="fill" style={{ width: `${Math.max(0, Math.min(100, it.value ?? 0))}%` }} />
              {refValue !== undefined && <span className="tick" style={{ left: `${refValue}%` }} title={refLabel} />}
            </div>
          </div>
        ))}
      </div>
    </ChartCard>
  );
}
