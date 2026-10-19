// Attendance rules that don't touch the database (BR-09, BR-17).

export const ATTENDANCE_STATUSES = ['present', 'late', 'absent', 'excused'] as const;
export type AttendanceStatus = (typeof ATTENDANCE_STATUSES)[number];

type Enrolment = { enrolledOn: string; endedOn: string | null };

// Was the student in the class on this date? Sessions outside these dates are left out for them (BR-17).
export const inClassOn = (e: Enrolment, date: string) => date >= e.enrolledOn && (e.endedOn === null || date <= e.endedOn);

export function countStatuses(statuses: (AttendanceStatus | null)[]) {
  const c = { present: 0, late: 0, absent: 0, excused: 0, unmarked: 0 };
  for (const s of statuses) c[s ?? 'unmarked']++;
  return c;
}

// BR-09: (present + late) / (sessions held − excused). A session counts as held for a student once their
// attendance was taken; cancelled sessions never appear here.
export function attendanceRate(sessions: { date: string; status: AttendanceStatus | null }[], e: Enrolment) {
  const marked = sessions.filter((s) => s.status !== null && inClassOn(e, s.date)).map((s) => s.status);
  const { present, late, absent, excused } = countStatuses(marked);
  const denominator = marked.length - excused;
  return { present, late, absent, excused, held: marked.length, percent: denominator > 0 ? ((present + late) / denominator) * 100 : null };
}
