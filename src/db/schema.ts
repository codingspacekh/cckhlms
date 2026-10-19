// Database schema. Auth tables follow Better Auth's username + admin plugins (ADR 0003);
// club settings (FR-ADM-16) and the audit log (NFR-11) are ours.
import { sql } from 'drizzle-orm';
import {
  type AnyPgColumn,
  bigint,
  bigserial,
  boolean,
  check,
  date,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  smallint,
  text,
  timestamp,
  unique,
  uniqueIndex,
} from 'drizzle-orm/pg-core';

const ts = (name: string) => timestamp(name, { withTimezone: true });

export const user = pgTable('user', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  email: text('email').notNull().unique(),
  emailVerified: boolean('email_verified').notNull().default(false),
  image: text('image'),
  createdAt: ts('created_at').notNull().defaultNow(),
  updatedAt: ts('updated_at').notNull().defaultNow(),
  username: text('username').unique(),
  displayUsername: text('display_username'),
  role: text('role'),
  banned: boolean('banned'),
  banReason: text('ban_reason'),
  banExpires: ts('ban_expires'),
});

export const session = pgTable(
  'session',
  {
    id: text('id').primaryKey(),
    expiresAt: ts('expires_at').notNull(),
    token: text('token').notNull().unique(),
    createdAt: ts('created_at').notNull().defaultNow(),
    updatedAt: ts('updated_at').notNull().defaultNow(),
    ipAddress: text('ip_address'),
    userAgent: text('user_agent'),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    impersonatedBy: text('impersonated_by'),
    lastActiveAt: ts('last_active_at'),
  },
  (t) => [index('session_user_idx').on(t.userId)],
);

export const account = pgTable('account', {
  id: text('id').primaryKey(),
  accountId: text('account_id').notNull(),
  providerId: text('provider_id').notNull(),
  userId: text('user_id')
    .notNull()
    .references(() => user.id, { onDelete: 'cascade' }),
  accessToken: text('access_token'),
  refreshToken: text('refresh_token'),
  idToken: text('id_token'),
  accessTokenExpiresAt: ts('access_token_expires_at'),
  refreshTokenExpiresAt: ts('refresh_token_expires_at'),
  scope: text('scope'),
  password: text('password'),
  createdAt: ts('created_at').notNull().defaultNow(),
  updatedAt: ts('updated_at').notNull().defaultNow(),
});

export const verification = pgTable('verification', {
  id: text('id').primaryKey(),
  identifier: text('identifier').notNull(),
  value: text('value').notNull(),
  expiresAt: ts('expires_at').notNull(),
  createdAt: ts('created_at').notNull().defaultNow(),
  updatedAt: ts('updated_at').notNull().defaultNow(),
});

export const rateLimit = pgTable('rate_limit', {
  id: text('id').primaryKey(),
  key: text('key').notNull().unique(),
  count: integer('count').notNull(),
  lastRequest: bigint('last_request', { mode: 'number' }).notNull(),
});

// One row only (id = 1). Every date and due time in the LMS is worked out in this time zone (BR-19).
export const clubSettings = pgTable(
  'club_settings',
  {
    id: smallint('id').primaryKey().default(1),
    clubName: text('club_name').notNull().default('CCKH Coding Club'),
    timeZone: text('time_zone').notNull().default('Asia/Phnom_Penh'),
    updatedAt: ts('updated_at').notNull().defaultNow(),
  },
  (t) => [check('club_settings_single_row', sql`${t.id} = 1`)],
);

export const auditLog = pgTable(
  'audit_log',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    at: ts('at').notNull().defaultNow(),
    actorId: text('actor_id').references(() => user.id, { onDelete: 'set null' }),
    action: text('action').notNull(),
    entity: text('entity'),
    entityId: text('entity_id'),
    detail: jsonb('detail'),
    ip: text('ip'),
  },
  (t) => [index('audit_log_actor_at_idx').on(t.actorId, t.at)],
);

// Admin-only details (NFR-07): guardian contact never leaves the admin screens.
export const studentProfile = pgTable('student_profile', {
  userId: text('user_id')
    .primaryKey()
    .references(() => user.id, { onDelete: 'cascade' }),
  guardianName: text('guardian_name'),
  guardianPhone: text('guardian_phone'),
  notes: text('notes'),
});

export const teacherProfile = pgTable('teacher_profile', {
  userId: text('user_id')
    .primaryKey()
    .references(() => user.id, { onDelete: 'cascade' }),
  phone: text('phone'),
  notes: text('notes'),
});

// Terms (FR-ADM-03): normally 4 a year. At most one is active (enforced in the service).
export const term = pgTable(
  'term',
  {
    id: text('id').primaryKey(),
    year: integer('year').notNull(),
    number: smallint('number').notNull(),
    name: text('name').notNull(),
    startDate: date('start_date').notNull(),
    endDate: date('end_date').notNull(),
    status: text('status').notNull().default('planned'),
    createdAt: ts('created_at').notNull().defaultNow(),
  },
  (t) => [
    unique('term_year_number').on(t.year, t.number),
    check('term_number_1_to_4', sql`${t.number} between 1 and 4`),
    check('term_dates_in_order', sql`${t.endDate} > ${t.startDate}`),
    check('term_status_known', sql`${t.status} in ('planned', 'active', 'closed')`),
  ],
);

// Courses (FR-ADM-04): reusable across terms; a class is one run of a course in a term.
export const course = pgTable(
  'course',
  {
    id: text('id').primaryKey(),
    code: text('code').notNull().unique(),
    name: text('name').notNull(),
    description: text('description'),
    defaultLanguage: text('default_language').notNull(),
    passMark: smallint('pass_mark').notNull().default(60),
    weightExam: smallint('weight_exam').notNull().default(60),
    weightClasswork: smallint('weight_classwork').notNull().default(30),
    weightHomework: smallint('weight_homework').notNull().default(10),
    nextCourseId: text('next_course_id').references((): AnyPgColumn => course.id, { onDelete: 'set null' }),
    createdAt: ts('created_at').notNull().defaultNow(),
  },
  (t) => [
    check('course_language_known', sql`${t.defaultLanguage} in ('python', 'java', 'web')`),
    check('course_pass_mark_range', sql`${t.passMark} between 0 and 100`),
    check('course_weights_sum_100', sql`${t.weightExam} + ${t.weightClasswork} + ${t.weightHomework} = 100`),
  ],
);

export const syllabusTopic = pgTable(
  'syllabus_topic',
  {
    id: text('id').primaryKey(),
    courseId: text('course_id')
      .notNull()
      .references(() => course.id, { onDelete: 'cascade' }),
    position: smallint('position').notNull(),
    title: text('title').notNull(),
  },
  (t) => [index('syllabus_topic_course_idx').on(t.courseId, t.position)],
);

// Classes (FR-ADM-05): one run of a course in a term, meeting once a week at the weekend.
export const klass = pgTable(
  'class',
  {
    id: text('id').primaryKey(),
    courseId: text('course_id')
      .notNull()
      .references(() => course.id, { onDelete: 'restrict' }),
    termId: text('term_id')
      .notNull()
      .references(() => term.id, { onDelete: 'restrict' }),
    name: text('name').notNull(),
    day: text('day').notNull(),
    startTime: text('start_time').notNull(),
    minutes: smallint('minutes').notNull(),
    firstDate: date('first_date').notNull(),
    weeks: smallint('weeks').notNull(),
    room: text('room'),
    capacity: smallint('capacity'),
    status: text('status').notNull().default('active'),
    createdAt: ts('created_at').notNull().defaultNow(),
  },
  (t) => [
    index('class_term_idx').on(t.termId),
    check('class_weekend_day', sql`${t.day} in ('sat', 'sun')`),
    check('class_start_time_format', sql`${t.startTime} ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'`),
    check('class_minutes_90_or_120', sql`${t.minutes} in (90, 120)`),
    check('class_weeks_10_to_12', sql`${t.weeks} between 10 and 12`),
    check('class_status_known', sql`${t.status} in ('active', 'archived')`),
  ],
);

export const classTeacher = pgTable(
  'class_teacher',
  {
    classId: text('class_id')
      .notNull()
      .references(() => klass.id, { onDelete: 'cascade' }),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'restrict' }),
    role: text('role').notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.classId, t.userId] }),
    index('class_teacher_user_idx').on(t.userId),
    uniqueIndex('class_one_lead')
      .on(t.classId)
      .where(sql`${t.role} = 'lead'`),
    check('class_teacher_role_known', sql`${t.role} in ('lead', 'assistant')`),
  ],
);

// One meeting of a class. Week numbers are worked out from the dates (BR-15), not stored.
export const classSession = pgTable(
  'class_session',
  {
    id: text('id').primaryKey(),
    classId: text('class_id')
      .notNull()
      .references(() => klass.id, { onDelete: 'cascade' }),
    date: date('date').notNull(),
    startTime: text('start_time').notNull(),
    minutes: smallint('minutes').notNull(),
    status: text('status').notNull().default('scheduled'),
    note: text('note'),
  },
  (t) => [
    unique('class_session_one_per_day').on(t.classId, t.date),
    check('class_session_status_known', sql`${t.status} in ('scheduled', 'cancelled')`),
  ],
);

// A student's membership in a class (FR-ADM-07). Attendance, work and reports hang off this, so data stays
// right when a student is in several classes or repeats a course. Ended enrolments are kept as history.
export const enrolment = pgTable(
  'enrolment',
  {
    id: text('id').primaryKey(),
    classId: text('class_id')
      .notNull()
      .references(() => klass.id, { onDelete: 'restrict' }),
    studentId: text('student_id')
      .notNull()
      .references(() => user.id, { onDelete: 'restrict' }),
    status: text('status').notNull().default('active'),
    enrolledOn: date('enrolled_on').notNull(),
    endedOn: date('ended_on'),
    transferredFromId: text('transferred_from_id').references((): AnyPgColumn => enrolment.id, { onDelete: 'set null' }),
    createdAt: ts('created_at').notNull().defaultNow(),
  },
  (t) => [
    index('enrolment_class_idx').on(t.classId),
    index('enrolment_student_idx').on(t.studentId),
    uniqueIndex('enrolment_one_active')
      .on(t.classId, t.studentId)
      .where(sql`${t.status} = 'active'`),
    check('enrolment_status_known', sql`${t.status} in ('active', 'withdrawn', 'completed')`),
    check('enrolment_end_after_start', sql`${t.endedOn} is null or ${t.endedOn} >= ${t.enrolledOn}`),
  ],
);

// The lesson note for one weekly session (FR-TCH-01/02). A lesson is visible to students when it's published
// and publish_at (if set) has passed; that's worked out at read time (ADR-08).
export const lesson = pgTable(
  'lesson',
  {
    id: text('id').primaryKey(),
    sessionId: text('session_id')
      .notNull()
      .unique()
      .references(() => classSession.id, { onDelete: 'cascade' }),
    title: text('title').notNull(),
    contentMd: text('content_md').notNull().default(''),
    status: text('status').notNull().default('draft'),
    publishAt: ts('publish_at'),
    authorId: text('author_id').references(() => user.id, { onDelete: 'set null' }),
    createdAt: ts('created_at').notNull().defaultNow(),
    updatedAt: ts('updated_at').notNull().defaultNow(),
  },
  (t) => [check('lesson_status_known', sql`${t.status} in ('draft', 'published')`)],
);

export const lessonTopic = pgTable(
  'lesson_topic',
  {
    lessonId: text('lesson_id')
      .notNull()
      .references(() => lesson.id, { onDelete: 'cascade' }),
    topicId: text('topic_id')
      .notNull()
      .references(() => syllabusTopic.id, { onDelete: 'cascade' }),
  },
  (t) => [primaryKey({ columns: [t.lessonId, t.topicId] })],
);

// Files attached to a lesson (FR-TCH-01). The bytes live in FileStorage under the row's id.
export const lessonAttachment = pgTable(
  'lesson_attachment',
  {
    id: text('id').primaryKey(),
    lessonId: text('lesson_id')
      .notNull()
      .references(() => lesson.id, { onDelete: 'cascade' }),
    filename: text('filename').notNull(),
    contentType: text('content_type').notNull(),
    size: integer('size').notNull(),
    uploadedBy: text('uploaded_by').references(() => user.id, { onDelete: 'set null' }),
    createdAt: ts('created_at').notNull().defaultNow(),
  },
  (t) => [index('lesson_attachment_lesson_idx').on(t.lessonId), check('lesson_attachment_size_positive', sql`${t.size} > 0`)],
);

// One student's attendance at one session (FR-TCH-06). Hangs off the enrolment, so it stays right when a
// student moves class. A session with no rows hasn't had attendance taken yet.
export const attendance = pgTable(
  'attendance',
  {
    sessionId: text('session_id')
      .notNull()
      .references(() => classSession.id, { onDelete: 'cascade' }),
    enrolmentId: text('enrolment_id')
      .notNull()
      .references(() => enrolment.id, { onDelete: 'cascade' }),
    status: text('status').notNull(),
    note: text('note'),
    markedBy: text('marked_by').references(() => user.id, { onDelete: 'set null' }),
    markedAt: ts('marked_at').notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.sessionId, t.enrolmentId] }),
    index('attendance_enrolment_idx').on(t.enrolmentId),
    check('attendance_status_known', sql`${t.status} in ('present', 'late', 'absent', 'excused')`),
  ],
);

// Q&A on a lesson (FR-STU-03/04, FR-TCH-03). A reported post is 'under_review' until a teacher restores it
// ('visible') or removes it ('hidden') (BR-20).
const qaVisibility = (col: AnyPgColumn) => sql`${col} in ('visible', 'under_review', 'hidden')`;

export const question = pgTable(
  'question',
  {
    id: text('id').primaryKey(),
    lessonId: text('lesson_id')
      .notNull()
      .references(() => lesson.id, { onDelete: 'cascade' }),
    authorId: text('author_id')
      .notNull()
      .references(() => user.id, { onDelete: 'restrict' }),
    bodyMd: text('body_md').notNull(),
    codeSnippet: text('code_snippet'),
    acceptedReplyId: text('accepted_reply_id').references((): AnyPgColumn => reply.id, { onDelete: 'set null' }),
    visibility: text('visibility').notNull().default('visible'),
    createdAt: ts('created_at').notNull().defaultNow(),
  },
  (t) => [index('question_lesson_idx').on(t.lessonId), check('question_visibility_known', qaVisibility(t.visibility))],
);

export const reply = pgTable(
  'reply',
  {
    id: text('id').primaryKey(),
    questionId: text('question_id')
      .notNull()
      .references((): AnyPgColumn => question.id, { onDelete: 'cascade' }),
    authorId: text('author_id')
      .notNull()
      .references(() => user.id, { onDelete: 'restrict' }),
    bodyMd: text('body_md').notNull(),
    visibility: text('visibility').notNull().default('visible'),
    createdAt: ts('created_at').notNull().defaultNow(),
  },
  (t) => [index('reply_question_idx').on(t.questionId), check('reply_visibility_known', qaVisibility(t.visibility))],
);

export const postReport = pgTable(
  'post_report',
  {
    id: text('id').primaryKey(),
    postType: text('post_type').notNull(),
    postId: text('post_id').notNull(),
    reporterId: text('reporter_id')
      .notNull()
      .references(() => user.id, { onDelete: 'restrict' }),
    reason: text('reason'),
    createdAt: ts('created_at').notNull().defaultNow(),
    resolvedBy: text('resolved_by').references(() => user.id, { onDelete: 'set null' }),
    resolvedAt: ts('resolved_at'),
    outcome: text('outcome'),
  },
  (t) => [
    index('post_report_post_idx').on(t.postType, t.postId),
    uniqueIndex('post_report_one_open_per_reporter')
      .on(t.postType, t.postId, t.reporterId)
      .where(sql`${t.resolvedAt} is null`),
    check('post_report_type_known', sql`${t.postType} in ('question', 'reply')`),
    check('post_report_outcome_known', sql`${t.outcome} is null or ${t.outcome} in ('restored', 'removed')`),
  ],
);

// The teacher's weekly class report (FR-TCH-14). The attendance summary isn't stored: it's worked out from
// the attendance rows when read, so it never goes stale. Its topics drive syllabus coverage (FR-TCH-20).
export const classReport = pgTable('class_report', {
  id: text('id').primaryKey(),
  sessionId: text('session_id')
    .notNull()
    .unique()
    .references(() => classSession.id, { onDelete: 'cascade' }),
  comment: text('comment').notNull().default(''),
  authorId: text('author_id').references(() => user.id, { onDelete: 'set null' }),
  updatedAt: ts('updated_at').notNull().defaultNow(),
});

export const classReportTopic = pgTable(
  'class_report_topic',
  {
    reportId: text('report_id')
      .notNull()
      .references(() => classReport.id, { onDelete: 'cascade' }),
    topicId: text('topic_id')
      .notNull()
      .references(() => syllabusTopic.id, { onDelete: 'cascade' }),
  },
  (t) => [primaryKey({ columns: [t.reportId, t.topicId] })],
);

// Classwork, homework and exams set in a week of a class (FR-TCH-07/08). An exam with several parts (theory,
// practical) is one row per part: BR-12 adds up exam scores and maxes. When it's due is worked out from the
// sessions (due_mode), except for a day and time the teacher chose (due_at), so BR-16 needs no job.
export const assessment = pgTable(
  'assessment',
  {
    id: text('id').primaryKey(),
    classId: text('class_id')
      .notNull()
      .references(() => klass.id, { onDelete: 'cascade' }),
    sessionId: text('session_id')
      .notNull()
      .references(() => classSession.id, { onDelete: 'cascade' }),
    kind: text('kind').notNull(),
    title: text('title').notNull(),
    instructionsMd: text('instructions_md').notNull().default(''),
    language: text('language').notNull(),
    maxScore: integer('max_score').notNull(),
    dueMode: text('due_mode').notNull(),
    dueAt: ts('due_at'),
    allowLate: boolean('allow_late').notNull().default(true),
    latePenaltyPct: integer('late_penalty_pct').notNull().default(10),
    // FR-CODE-06: the template project copied into each student's draft. [] = the language's default template.
    starterFiles: jsonb('starter_files').$type<{ path: string; content: string }[]>().notNull().default([]),
    status: text('status').notNull().default('draft'),
    authorId: text('author_id').references(() => user.id, { onDelete: 'set null' }),
    createdAt: ts('created_at').notNull().defaultNow(),
    updatedAt: ts('updated_at').notNull().defaultNow(),
  },
  (t) => [
    index('assessment_class_idx').on(t.classId),
    check('assessment_kind_known', sql`${t.kind} in ('classwork', 'homework', 'exam')`),
    check('assessment_language_known', sql`${t.language} in ('python', 'java', 'web', 'paper')`),
    check('assessment_status_known', sql`${t.status} in ('draft', 'published')`),
    check('assessment_max_score_range', sql`${t.maxScore} between 1 and 1000`),
    check('assessment_penalty_range', sql`${t.latePenaltyPct} between 0 and 100`),
    check('assessment_due_mode_known', sql`${t.dueMode} in ('next_session', 'session_end', 'fixed')`),
    check('assessment_due_at_when_fixed', sql`(${t.dueMode} = 'fixed') = (${t.dueAt} is not null)`),
  ],
);

// A student's work in progress on one piece of work (FR-CODE-05), autosaved while they type. It starts as a copy
// of the starter files; submitting (M4 PR 3) snapshots it. Checked against the project limits on every save.
export const workDraft = pgTable(
  'work_draft',
  {
    id: text('id').primaryKey(),
    assessmentId: text('assessment_id')
      .notNull()
      .references(() => assessment.id, { onDelete: 'cascade' }),
    studentId: text('student_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    files: jsonb('files').$type<{ path: string; content: string }[]>().notNull(),
    updatedAt: ts('updated_at').notNull().defaultNow(),
  },
  (t) => [unique('work_draft_one_per_student').on(t.assessmentId, t.studentId)],
);
