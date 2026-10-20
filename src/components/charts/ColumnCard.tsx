'use client';
// Columns from one baseline: ≤ 24 px wide with 4 px rounded tops, a hairline grid, one scale. Each column is its
// own hover and focus target, wider than the mark.
import { ChartCard } from './ChartCard';
import { fmt, niceMax } from './format';
import { useChartWidth, useTooltip } from './Tooltip';

export type ColumnItem = { label: string; short?: string; value: number | null };

export function ColumnCard({
  title,
  subtitle,
  items,
  unit = '',
  valueHead,
  labelHead = 'Item',
  max,
  refValue,
  refLabel = '',
  empty = 'Nothing to show yet.',
}: {
  title: string;
  subtitle?: string;
  items: ColumnItem[];
  unit?: string;
  valueHead: string;
  labelHead?: string;
  max?: number;
  refValue?: number;
  refLabel?: string;
  empty?: string;
}) {
  const { box, bind, tooltip } = useTooltip();
  const w = useChartWidth(box, 560);
  const table = { head: [labelHead, valueHead], rows: items.map((i) => [i.label, fmt(i.value, unit)]) };
  const top = max ?? (unit === '%' ? 100 : niceMax(Math.max(1, ...items.map((i) => i.value ?? 0))));
  const h = 220,
    pl = 40,
    pr = 12,
    pt = 18,
    pb = 30;
  const ch = h - pt - pb,
    cw = w - pl - pr,
    step = cw / Math.max(1, items.length),
    bw = Math.min(24, step * 0.45);
  const y = (v: number) => pt + ch - (Math.max(0, Math.min(v, top)) / top) * ch;
  const base = pt + ch;
  // Counts get whole-number ticks only.
  const ticks = unit === '%' || Number.isInteger(top / 2) ? [0, top / 2, top] : [0, top];
  return (
    <ChartCard title={title} subtitle={subtitle} table={table} empty={items.length === 0 && empty}>
      <div className="chart" ref={box}>
        <svg className="c" viewBox={`0 0 ${w} ${h}`} aria-label={title} role="group">
          {ticks.map((t) => (
            <g key={t}>
              <line className={t ? 'gl' : 'ax'} x1={pl} x2={w - pr} y1={y(t)} y2={y(t)} />
              <text x={pl - 8} y={y(t) + 4} textAnchor="end">
                {fmt(t, unit)}
              </text>
            </g>
          ))}
          {items.map((it, i) => {
            const cx = pl + step * i + step / 2,
              x = cx - bw / 2,
              v = it.value;
            const yt = v === null ? base : y(v),
              r = Math.min(4, base - yt);
            return (
              <g key={i}>
                <g
                  className="hb"
                  tabIndex={0}
                  role="img"
                  aria-label={`${it.label}: ${fmt(v, unit)}`}
                  data-value={v === null ? undefined : String(v)}
                  {...bind({ title: it.label, rows: [{ value: fmt(v, unit), name: valueHead }] })}
                >
                  <rect className="hit" x={pl + step * i} y={pt} width={step} height={ch} fill="transparent" />
                  {v !== null && v > 0 && (
                    <path
                      className="bar"
                      d={`M${x},${base} V${yt + r} Q${x},${yt} ${x + r},${yt} H${x + bw - r} Q${x + bw},${yt} ${x + bw},${yt + r} V${base} Z`}
                    />
                  )}
                  {v !== null && (
                    <text className="v" x={cx} y={yt - 6} textAnchor="middle">
                      {fmt(v, unit)}
                    </text>
                  )}
                </g>
                <text x={cx} y={h - 10} textAnchor="middle">
                  {it.short ?? it.label}
                </text>
              </g>
            );
          })}
          {refValue !== undefined && (
            <g>
              <line className="ref" x1={pl} x2={w - pr} y1={y(refValue)} y2={y(refValue)} />
              <text className="reflbl" x={w - pr} y={y(refValue) - 6} textAnchor="end">
                {refLabel}
              </text>
            </g>
          )}
        </svg>
        {tooltip}
      </div>
    </ChartCard>
  );
}
