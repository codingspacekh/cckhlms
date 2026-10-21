// Who a class belongs to, for the policy's "own class" rules: its teachers (and its lead), the students
// enrolled in it now, and whether it is archived.
import { and, eq, inArray } from 'drizzle-orm';
import { db } from '@/db/client';
import { classTeacher, enrolment, klass } from '@/db/schema';
import type { PolicyContext } from '@/server/policy';

// An archived class can be looked at but not changed (FR-ADM-14). Code that only shows the class asks for
// 'read', which leaves the archived flag out; everything else gets it, so the policy refuses the change.
export async function classAccess(classId: string, purpose: 'change' | 'read' = 'change'): Promise<PolicyContext> {
  const [teachers, students, [k]] = await Promise.all([
    db.select({ id: classTeacher.userId, role: classTeacher.role }).from(classTeacher).where(eq(classTeacher.classId, classId)),
    db
      .select({ id: enrolment.studentId })
      .from(enrolment)
      .where(and(eq(enrolment.classId, classId), eq(enrolment.status, 'active'))),
    db.select({ status: klass.status }).from(klass).where(eq(klass.id, classId)).limit(1),
  ]);
  return {
    classTeacherIds: teachers.map((r) => r.id),
    classLeadIds: teachers.filter((r) => r.role === 'lead').map((r) => r.id),
    classStudentIds: students.map((r) => r.id),
    classArchived: purpose === 'change' && k?.status === 'archived',
  };
}

// Just its teachers, for the rules that only ask whether someone teaches the class.
export async function classTeacherIds(classId: string): Promise<string[]> {
  const rows = await db.select({ id: classTeacher.userId }).from(classTeacher).where(eq(classTeacher.classId, classId));
  return rows.map((r) => r.id);
}

// The students a class's pages list: those in it now and those who finished it (promotion marks them completed,
// FR-ADM-13), so a promoted class still shows its marks and reports (BR-07). Students who withdrew are left out.
export const enrolledOrCompleted = inArray(enrolment.status, ['active', 'completed']);
