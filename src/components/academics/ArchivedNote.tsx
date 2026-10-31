import { promotedText, type Promoted } from '@/modules/promotion/rules';

// FR-ADM-14: an archived class is shown as it was, but can't be changed. A promoted class says when, by whom and how
// many moved on (M15a): it may have been promoted before its term ended.
export function ArchivedNote({ termName, timeZone, promotion }: { termName: string; timeZone: string; promotion?: Promoted | null }) {
  return (
    <p className="note" role="note">
      <strong>Archived.</strong>{' '}
      {promotion
        ? `${promotedText(promotion, timeZone)} This class can be looked at but not changed.`
        : `${termName} has ended, so this class can be looked at but not changed.`}
    </p>
  );
}
