'use client';
import { useRouter } from 'next/navigation';
import { Select } from '@/components/ui/Select';

// The term and week to show on Weekly reports; picking one goes there (the page reads them from the address).
export function WeekPicker({
  terms,
  termId,
  weeks,
  week,
}: {
  terms: { id: string; name: string }[];
  termId: string;
  weeks: { week: number; label: string }[];
  week: number;
}) {
  const router = useRouter();
  const go = (term: string, w?: string) => router.push(`/admin/weekly-reports?term=${term}${w ? `&week=${w}` : ''}`);
  return (
    <div className="row picker">
      <label className="f">
        Term
        <Select value={termId} onChange={(e) => go(e.target.value)}>
          {terms.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </Select>
      </label>
      <label className="f">
        Week
        <Select value={String(week)} onChange={(e) => go(termId, e.target.value)}>
          {weeks.map((w) => (
            <option key={w.week} value={w.week}>
              {w.label}
            </option>
          ))}
        </Select>
      </label>
    </div>
  );
}
