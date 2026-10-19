// Who a class belongs to, for the policy's "own class" rules: its teachers, and the students enrolled in it now.
import { and, eq } from 'drizzle-orm';
import { db } from '@/db/client';
import { classTeacher, enrolment } from '@/db/schema';
import type { PolicyContext } from '@/server/policy';

export async function classAccess(classId: string): Promise<PolicyContext> {
  const [teachers, students] = await Promise.all([
    db.select({ id: classTeacher.userId }).from(classTeacher).where(eq(classTeacher.classId, classId)),
    db
      .select({ id: enrolment.studentId })
      .from(enrolment)
      .where(and(eq(enrolment.classId, classId), eq(enrolment.status, 'active'))),
  ]);
  return { classTeacherIds: teachers.map((r) => r.id), classStudentIds: students.map((r) => r.id) };
}
