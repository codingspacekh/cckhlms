'use client';
// One tooltip per chart, on hover and on keyboard focus alike. Everything in it is text: labels can come from
// what teachers typed, so they never go in as HTML. The value leads; the series name follows with its line key.
import { useCallback, useEffect, useRef, useState, type FocusEvent, type PointerEvent } from 'react';

export type TipRow = { value: string; name: string; slot?: 1 | 2 };
export type Tip = { title: string; rows: TipRow[] };
type Shown = Tip & { x: number; y: number };

// The chart draws at its real width, so its text stays 11 px on a phone instead of shrinking with the picture.
export function useChartWidth(box: React.RefObject<HTMLDivElement | null>, fallback: number) {
  const [width, setWidth] = useState(fallback);
  useEffect(() => {
    const el = box.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(([e]) => {
      const w = Math.round(e!.contentRect.width);
      if (w > 0) setWidth(Math.max(280, w));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [box]);
  return width;
}

export function useTooltip() {
  const box = useRef<HTMLDivElement>(null);
  const [shown, setShown] = useState<Shown | null>(null);
  const at = useCallback((clientX: number, clientY: number) => {
    const r = box.current?.getBoundingClientRect();
    return { x: clientX - (r?.left ?? 0), y: clientY - (r?.top ?? 0) };
  }, []);
  const bind = (tip: Tip) => ({
    onPointerMove: (e: PointerEvent) => setShown({ ...tip, ...at(e.clientX, e.clientY) }),
    onPointerLeave: () => setShown(null),
    onFocus: (e: FocusEvent<Element>) => {
      const r = e.currentTarget.getBoundingClientRect();
      setShown({ ...tip, ...at(r.left + r.width / 2, r.top) });
    },
    onBlur: () => setShown(null),
  });
  const tooltip = shown && (
    <div className="tip" role="tooltip" style={{ left: shown.x, top: shown.y }}>
      <div className="t">{shown.title}</div>
      {shown.rows.map((r) => (
        <div className="rw" key={r.name}>
          <b>{r.value}</b>
          <span>
            <i className={r.slot === 2 ? 's2' : undefined} />
            {r.name}
          </span>
        </div>
      ))}
    </div>
  );
  return { box, bind, tooltip };
}
