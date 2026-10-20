import { round1 } from '@/modules/assessments/rules';

// One way to write a value everywhere a chart shows it (labels, tooltips, table view): up to 1 decimal.
export const fmt = (v: number | null, unit = '') => (v === null ? '—' : `${round1(v)}${unit}`);

// A clean top for a count axis: 5, 10, 20, 50, 100 …
export function niceMax(m: number) {
  if (m <= 5) return 5;
  if (m <= 10) return 10;
  const p = 10 ** Math.floor(Math.log10(m));
  const n = m / p;
  return (n <= 2 ? 2 : n <= 5 ? 5 : 10) * p;
}
