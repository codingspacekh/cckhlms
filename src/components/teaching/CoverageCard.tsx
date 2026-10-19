import { Pill } from '@/components/ui/Pill';
import type { Coverage } from '@/modules/teaching/reports';

// FR-TCH-20: which syllabus topics the weekly reports say were covered, and which are still to come.
export function CoverageCard({ coverage }: { coverage: Coverage }) {
  const pct = coverage.total ? Math.round((coverage.covered / coverage.total) * 100) : 0;
  return (
    <section className="card stack" aria-labelledby="coverage-title">
      <div>
        <h2 id="coverage-title">Syllabus coverage</h2>
        <p className="small muted">
          {coverage.covered} of {coverage.total} topics, from the weekly reports
        </p>
      </div>
      {coverage.total === 0 ? (
        <p className="small muted">This course has no syllabus yet.</p>
      ) : (
        <>
          <div className="meter" role="img" aria-label={`${coverage.covered} of ${coverage.total} topics covered`}>
            <i style={{ width: `${pct}%` }} />
          </div>
          <ul className="plain list" aria-label="Syllabus topics">
            {coverage.topics.map((t) => (
              <li key={t.id} className="spread small">
                <span className={t.weeks.length ? undefined : 'muted'}>{t.title}</span>
                {t.weeks.length > 0 ? (
                  <Pill tone="good" icon="check">
                    Week {t.weeks.join(', ')}
                  </Pill>
                ) : (
                  <span className="xs muted">To come</span>
                )}
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
