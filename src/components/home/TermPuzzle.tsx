import { PIECE_LABEL, type PieceState } from '@/modules/reporting/puzzle-rules';

// The term puzzle (FR-STU-11, BR-21): one piece per weekly session, shaped like the pieces in the club's logo.
// The piece's look follows its state; the week and the state are also in words for screen readers and below it.
export const PIECE = 'M10 22H36a12 12 0 1 1 24 0H82V44a12 12 0 1 1 0 24V92H10Z';
// Earned pieces take the logo's three colours in turn: blue, green, pink.
const TONES = ['blue', 'green', 'pink'] as const;

export function TermPuzzle({ pieces, label }: { pieces: { week: number; state: PieceState }[]; label: string }) {
  let earned = 0;
  return (
    <ol className="puzzle" aria-label={label}>
      {pieces.map((p) => {
        const tone = p.state === 'earned' ? TONES[earned++ % TONES.length] : null;
        return (
          <li key={p.week} className={`piece ${p.state}${tone ? ` ${tone}` : ''}`} aria-label={`Week ${p.week}: ${PIECE_LABEL[p.state]}`}>
            <svg viewBox="0 0 100 100" aria-hidden="true" focusable="false">
              <path d={PIECE} />
              <text x="46" y="66" textAnchor="middle">
                {p.week}
              </text>
            </svg>
            <span className="piece-label" aria-hidden="true">
              {p.state === 'coming' ? '' : PIECE_LABEL[p.state]}
            </span>
          </li>
        );
      })}
    </ol>
  );
}
