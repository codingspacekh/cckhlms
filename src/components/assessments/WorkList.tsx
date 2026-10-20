import Link from 'next/link';
import { Pill } from '@/components/ui/Pill';
import { KIND_LABEL, WORK_LANGUAGE_LABEL, type Kind, type WorkLanguage } from '@/modules/assessments/rules';
import type { MyStanding } from '@/modules/assessments/submissions';

export type WorkListItem = {
  id: string;
  title: string;
  kind: Kind;
  language: WorkLanguage;
  maxScore: number;
  dueLabel: string;
  week?: number | null;
  mine?: MyStanding;
};

// Where the student stands, in words (never colour alone).
function Standing({ mine, maxScore }: { mine: MyStanding; maxScore: number }) {
  const pill = (tone: 'good' | 'warn' | 'bad' | 'info', icon: 'check' | 'clock' | 'alert', text: string) => (
    <span data-testid="mine">
      <Pill tone={tone} icon={icon}>
        {text}
      </Pill>
    </span>
  );
  if (mine.mark === 'graded') return pill('good', 'check', `Marked ${mine.score} / ${maxScore}`);
  if (mine.mark === 'returned') return pill('warn', 'alert', 'Returned for redo');
  if (mine.status === 'late') return pill('warn', 'clock', 'Handed in late');
  if (mine.status === 'submitted') return pill('info', 'check', 'Handed in');
  if (mine.status === 'missing') return pill('bad', 'alert', 'Missing');
  return null;
}

// A student's classwork, homework and exams, each linking to its page (FR-STU-05), with where they stand
// (FR-STU-06).
export function WorkList({ classId, items, showWeek = false }: { classId: string; items: WorkListItem[]; showWeek?: boolean }) {
  return (
    <ul className="plain list" aria-label="Classwork and homework">
      {items.map((a) => (
        <li key={a.id} className="spread">
          <span className="cell-line">
            <Link className="strong" href={`/student/classes/${classId}/work/${a.id}`}>
              {a.title}
            </Link>
            <Pill>{KIND_LABEL[a.kind]}</Pill>
            <span className="small muted">
              {showWeek && a.week ? `Week ${a.week} · ` : ''}
              {WORK_LANGUAGE_LABEL[a.language]} · out of {a.maxScore}
            </span>
          </span>
          <span className="cell-line">
            {a.mine && <Standing mine={a.mine} maxScore={a.maxScore} />}
            <span className="small tnum">Due {a.dueLabel}</span>
          </span>
        </li>
      ))}
    </ul>
  );
}
