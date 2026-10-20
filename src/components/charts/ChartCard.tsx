'use client';
// A chart in a card, with its table view: the same values as a plain table (the accessible twin of every chart).
import { useState, type ReactNode } from 'react';
import { TableScroll } from '@/components/ui/TableScroll';

export type ChartTable = { head: string[]; rows: string[][] };

export function ChartCard({
  title,
  subtitle,
  table,
  empty,
  children,
}: {
  title: string;
  subtitle?: ReactNode;
  table: ChartTable;
  empty?: string | false; // shown instead of the chart when there's nothing to plot
  children: ReactNode;
}) {
  const [asTable, setAsTable] = useState(false);
  return (
    <section className="card" aria-label={title}>
      <div className="chart-head">
        <div>
          <h2>{title}</h2>
          {subtitle && <p>{subtitle}</p>}
        </div>
        {!empty && (
          <button type="button" className="btn ghost sm" aria-pressed={asTable} onClick={() => setAsTable((v) => !v)}>
            Table
          </button>
        )}
      </div>
      {empty ? (
        <p className="small muted chart-empty">{empty}</p>
      ) : asTable ? (
        <TableScroll label={`${title} table`}>
          <table aria-label={title}>
            <thead>
              <tr>
                {table.head.map((h, i) => (
                  <th key={h} scope="col" className={i ? 'n' : undefined}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {table.rows.map((r, i) => (
                <tr key={i}>
                  {r.map((c, j) =>
                    j === 0 ? (
                      <th key={j} scope="row">
                        {c}
                      </th>
                    ) : (
                      <td key={j} className="n tnum">
                        {c}
                      </td>
                    ),
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </TableScroll>
      ) : (
        children
      )}
    </section>
  );
}
