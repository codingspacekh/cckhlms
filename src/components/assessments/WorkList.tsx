import Link from 'next/link';
import { Pill } from '@/components/ui/Pill';
import { KIND_LABEL, WORK_LANGUAGE_LABEL, type Kind, type WorkLanguage } from '@/modules/assessments/rules';

export type WorkListItem = {
  id: string;
  title: string;
  kind: Kind;
  language: WorkLanguage;
  maxScore: number;
  dueLabel: string;
  week?: number | null;
};

// A student's classwork, homework and exams, each linking to its page (FR-STU-05).
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
          <span className="small tnum">Due {a.dueLabel}</span>
        </li>
      ))}
    </ul>
  );
}
