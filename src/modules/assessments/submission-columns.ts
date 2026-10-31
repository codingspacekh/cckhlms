// Every column of a hand-in but its files (M17b): marks, lists and counts never need the project itself, and a
// student's stored versions can be large. Read files only for the one version a page shows.
import { getTableColumns } from 'drizzle-orm';
import { submission } from '@/db/schema';

const columns = getTableColumns(submission);
export const submissionMeta = Object.fromEntries(Object.entries(columns).filter(([name]) => name !== 'files')) as Omit<
  typeof columns,
  'files'
>;
export type SubmissionMeta = Omit<typeof submission.$inferSelect, 'files'>;
