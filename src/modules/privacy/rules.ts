// A student's data on request (NFR-07). Deleting it anonymises the student (owner's decision, 2026-10-21): the
// personal data goes, and their marks and results stay under DELETED_NAME, so class numbers and the audit log
// stay true (the retention table in docs/02).
export const DELETED_NAME = 'Deleted student';

export const erasedEmail = (userId: string) => `${userId}@deleted.cckh.invalid`;

export const exportFilename = (username: string | null, day: string) => `student-data-${username ?? 'deleted'}-${day}.json`;

// Admin types the student's username to confirm, so the wrong row can't be deleted by a slip of the mouse.
export function confirmsErase(typed: string, username: string | null): boolean {
  return !!username && typed.trim().toLowerCase() === username.toLowerCase();
}

// Audit details keep what happened but not who it was: names and usernames come out, and what a teacher wrote
// about the student as a term report's reason (M17d, F08).
const SCRUBBED = new Set(['username', 'name', 'reason', 'changeReason']);
export function scrubAuditDetail(detail: unknown): unknown {
  if (!detail || typeof detail !== 'object' || Array.isArray(detail)) return detail;
  return Object.fromEntries(Object.entries(detail).filter(([k]) => !SCRUBBED.has(k)));
}
