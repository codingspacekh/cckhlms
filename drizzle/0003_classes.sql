CREATE TABLE "class_session" (
	"id" text PRIMARY KEY NOT NULL,
	"class_id" text NOT NULL,
	"date" date NOT NULL,
	"start_time" text NOT NULL,
	"minutes" smallint NOT NULL,
	"status" text DEFAULT 'scheduled' NOT NULL,
	"note" text,
	CONSTRAINT "class_session_one_per_day" UNIQUE("class_id","date"),
	CONSTRAINT "class_session_status_known" CHECK ("class_session"."status" in ('scheduled', 'cancelled'))
);
--> statement-breakpoint
CREATE TABLE "class_teacher" (
	"class_id" text NOT NULL,
	"user_id" text NOT NULL,
	"role" text NOT NULL,
	CONSTRAINT "class_teacher_class_id_user_id_pk" PRIMARY KEY("class_id","user_id"),
	CONSTRAINT "class_teacher_role_known" CHECK ("class_teacher"."role" in ('lead', 'assistant'))
);
--> statement-breakpoint
CREATE TABLE "class" (
	"id" text PRIMARY KEY NOT NULL,
	"course_id" text NOT NULL,
	"term_id" text NOT NULL,
	"name" text NOT NULL,
	"day" text NOT NULL,
	"start_time" text NOT NULL,
	"minutes" smallint NOT NULL,
	"first_date" date NOT NULL,
	"weeks" smallint NOT NULL,
	"room" text,
	"capacity" smallint,
	"status" text DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "class_weekend_day" CHECK ("class"."day" in ('sat', 'sun')),
	CONSTRAINT "class_start_time_format" CHECK ("class"."start_time" ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'),
	CONSTRAINT "class_minutes_90_or_120" CHECK ("class"."minutes" in (90, 120)),
	CONSTRAINT "class_weeks_10_to_12" CHECK ("class"."weeks" between 10 and 12),
	CONSTRAINT "class_status_known" CHECK ("class"."status" in ('active', 'archived'))
);
--> statement-breakpoint
ALTER TABLE "class_session" ADD CONSTRAINT "class_session_class_id_class_id_fk" FOREIGN KEY ("class_id") REFERENCES "public"."class"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "class_teacher" ADD CONSTRAINT "class_teacher_class_id_class_id_fk" FOREIGN KEY ("class_id") REFERENCES "public"."class"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "class_teacher" ADD CONSTRAINT "class_teacher_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "class" ADD CONSTRAINT "class_course_id_course_id_fk" FOREIGN KEY ("course_id") REFERENCES "public"."course"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "class" ADD CONSTRAINT "class_term_id_term_id_fk" FOREIGN KEY ("term_id") REFERENCES "public"."term"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "class_teacher_user_idx" ON "class_teacher" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "class_one_lead" ON "class_teacher" USING btree ("class_id") WHERE "class_teacher"."role" = 'lead';--> statement-breakpoint
CREATE INDEX "class_term_idx" ON "class" USING btree ("term_id");