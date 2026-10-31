'use client';
// Lines on a 0–100 scale: 2 px, a marker at each point with a surface ring, a 10 % wash under the first series.
// A hover band per point (the crosshair) shows every series there. A legend appears for two series; one series
// is named by the title.
import { ChartCard } from './ChartCard';
import { fmt } from './format';
import { useChartWidth, useTooltip } from './Tooltip';

export type LinePoint = { label: string; full?: string; value: number | null; text?: string }; // text: shown instead of the value
export type LineSeries = { name: string; points: LinePoint[] };

export function LineCard({
  title,
  subtitle,
  series,
  unit = '%',
  refValue,
  refLabel = '',
  empty = 'Nothing to show yet.',
}: {
  title: string;
  subtitle?: string;
  series: LineSeries[]; // at most two: slot 1 (blue) and slot 2 (orange)
  unit?: string;
  refValue?: number;
  refLabel?: string;
  empty?: string;
}) {
  const { box, bind, tooltip } = useTooltip();
  const w = useChartWidth(box, 600);
  const points = series[0]?.points ?? [];
  const n = points.length;
  const name = (i: number) => points[i]!.full ?? points[i]!.label;
  const table = {
    head: ['Point', ...series.map((s) => s.name)],
    rows: points.map((_, i) => [name(i), ...series.map((s) => s.points[i]?.text ?? fmt(s.points[i]?.value ?? null, unit))]),
  };
  const h = 240,
    pl = 40,
    pr = 16,
    pt = 16,
    pb = 30,
    ch = h - pt - pb,
    cw = w - pl - pr;
  const x = (i: number) => pl + (n < 2 ? cw / 2 : (cw * i) / (n - 1));
  const y = (v: number) => pt + ch - (Math.max(0, Math.min(v, 100)) / 100) * ch;
  const path = (s: LineSeries) =>
    s.points.reduce(
      (d, p, i) => (p.value === null ? d : `${d}${d && s.points[i - 1]?.value != null ? 'L' : 'M'}${x(i)},${y(p.value)} `),
      '',
    );
  const band = n < 2 ? cw : cw / (n - 1);
  const first = series[0];
  const washable = first && first.points.every((p) => p.value !== null) && n > 1;
  return (
    <ChartCard title={title} subtitle={subtitle} table={table} empty={n === 0 && empty}>
      {series.length > 1 && (
        <div className="legend">
          {series.map((s, i) => (
            <span key={s.name}>
              <i className={i === 1 ? 's2' : undefined} />
              {s.name}
            </span>
          ))}
        </div>
      )}
      <div className="chart" ref={box}>
        <svg className="c" viewBox={`0 0 ${w} ${h}`} aria-label={title} role="group">
          {[0, 50, 100].map((t) => (
            <g key={t}>
              <line className={t ? 'gl' : 'ax'} x1={pl} x2={w - pr} y1={y(t)} y2={y(t)} />
              <text x={pl - 8} y={y(t) + 4} textAnchor="end">
                {t}
              </text>
            </g>
          ))}
          {refValue !== undefined && (
            <g>
              <line className="ref" x1={pl} x2={w - pr} y1={y(refValue)} y2={y(refValue)} />
              <text className="reflbl" x={pl + 6} y={y(refValue) - 6}>
                {refLabel}
              </text>
            </g>
          )}
          {washable && <path className="wash" d={`${path(first)}L${x(n - 1)},${y(0)} L${x(0)},${y(0)} Z`} />}
          {[...series].reverse().map((s) => (
            <path key={s.name} className={`ln s${series.indexOf(s) + 1}`} d={path(s)} />
          ))}
          {series.map((s, si) =>
            s.points.map((p, i) =>
              p.value === null ? null : (
                <circle key={`${si}-${i}`} className={`dot s${si + 1}`} cx={x(i)} cy={y(p.value)} r={4} data-value={String(p.value)} />
              ),
            ),
          )}
          {(() => {
            // One direct label: the first series' last value.
            const i = first ? first.points.findLastIndex((p) => p.value !== null) : -1;
            if (i < 0) return null;
            return (
              <text className="v" x={n < 2 ? x(i) : x(i) - 8} y={y(first!.points[i]!.value!) - 10} textAnchor={n < 2 ? 'middle' : 'end'}>
                {fmt(first!.points[i]!.value, unit)}
              </text>
            );
          })()}
          {points.map((p, i) => {
            const rows = series.map((s, si) => ({
              value: s.points[i]?.text ?? fmt(s.points[i]?.value ?? null, unit),
              name: s.name,
              slot: (si + 1) as 1 | 2,
            }));
            return (
              <g key={i}>
                <g
                  className="hx"
                  tabIndex={0}
                  role="img"
                  aria-label={`${name(i)}: ${rows.map((r) => `${r.name} ${r.value}`).join(', ')}`}
                  {...bind({ title: name(i), rows })}
                >
                  <rect className="hit" x={Math.max(pl, x(i) - band / 2)} y={pt} width={band} height={ch} fill="transparent" />
                  <line className="xh" x1={x(i)} x2={x(i)} y1={pt} y2={pt + ch} />
                </g>
                <text x={x(i)} y={h - 10} textAnchor="middle">
                  {p.label}
                </text>
              </g>
            );
          })}
        </svg>
        {tooltip}
      </div>
    </ChartCard>
  );
}
