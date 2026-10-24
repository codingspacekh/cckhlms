import { PIECE } from './TermPuzzle';

// The weeks of a term as puzzle pieces (M8 admin banner): the ones gone by in the logo's colours, this week
// outlined, the rest to come. A picture of what the sentence beside it says, so screen readers get one label.
const TONES = ['blue', 'green', 'pink'] as const;

export function TermWeeks({ week, weeks, label }: { week: number; weeks: number; label: string }) {
  return (
    <div className="puzzle compact" role="img" aria-label={label}>
      {Array.from({ length: weeks }, (_, i) => {
        const n = i + 1;
        const state = n < week ? `earned ${TONES[i % TONES.length]}` : n === week ? 'now' : 'coming';
        return (
          <span key={n} className={`piece ${state}`}>
            <svg viewBox="0 0 100 100" aria-hidden="true" focusable="false">
              <path d={PIECE} />
            </svg>
          </span>
        );
      })}
    </div>
  );
}
