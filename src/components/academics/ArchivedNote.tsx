// FR-ADM-14: an archived class is shown as it was, but can't be changed.
export function ArchivedNote({ termName }: { termName: string }) {
  return (
    <p className="note" role="note">
      <strong>Archived.</strong> {termName} has ended, so this class can be looked at but not changed.
    </p>
  );
}
