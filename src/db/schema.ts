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
