// A score out of 100 as a meter, with the pass mark as a tick: below it the fill turns to warning, and more than
// 10 below to danger. The value is always written next to it as well.
export function Meter({ value, passMark }: { value: number | null; passMark: number }) {
  if (value === null) return <div className="meter" aria-hidden="true" />;
  const tone = value >= passMark ? '' : value >= passMark - 10 ? 'warn' : 'bad';
  return (
    <div className="meter" role="img" aria-label={`${value.toFixed(1)} out of 100, pass mark ${passMark}`}>
      <i className={tone} style={{ width: `${Math.min(100, Math.max(0, value))}%` }} />
      <b style={{ left: `${passMark}%` }} />
    </div>
  );
}

// A small trend line for a stat tile (0–100). Decorative: the numbers are written beside it.
export function Sparkline({ values }: { values: number[] }) {
  if (values.length < 2) return null;
  const w = 120,
    h = 28;
  const x = (i: number) => (i * (w - 6)) / (values.length - 1) + 3;
  const y = (v: number) => h - 3 - (Math.max(0, Math.min(v, 100)) / 100) * (h - 6);
  const last = values.length - 1;
  return (
    <svg className="spark" viewBox={`0 0 ${w} ${h}`} width={w} height={h} aria-hidden="true">
      <path
        d={values.map((v, i) => `${i ? 'L' : 'M'}${x(i)},${y(v)}`).join(' ')}
        fill="none"
        stroke="var(--s1)"
        strokeWidth={2}
        strokeLinejoin="round"
        strokeLinecap="round"
      />
      <circle cx={x(last)} cy={y(values[last]!)} r={3.5} fill="var(--s1)" stroke="var(--surface)" strokeWidth={2} />
    </svg>
  );
}
