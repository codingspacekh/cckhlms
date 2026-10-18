CREATE TABLE "course" (
	"id" text PRIMARY KEY NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"default_language" text NOT NULL,
	"pass_mark" smallint DEFAULT 60 NOT NULL,
	"weight_exam" smallint DEFAULT 60 NOT NULL,
	"weight_classwork" smallint DEFAULT 30 NOT NULL,
	"weight_homework" smallint DEFAULT 10 NOT NULL,
	"next_course_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "course_code_unique" UNIQUE("code"),
	CONSTRAINT "course_language_known" CHECK ("course"."default_language" in ('python', 'java', 'web')),
	CONSTRAINT "course_pass_mark_range" CHECK ("course"."pass_mark" between 0 and 100),
	CONSTRAINT "course_weights_sum_100" CHECK ("course"."weight_exam" + "course"."weight_classwork" + "course"."weight_homework" = 100)
);
--> statement-breakpoint
CREATE TABLE "syllabus_topic" (
	"id" text PRIMARY KEY NOT NULL,
	"course_id" text NOT NULL,
	"position" smallint NOT NULL,
	"title" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "term" (
	"id" text PRIMARY KEY NOT NULL,
	"year" integer NOT NULL,
	"number" smallint NOT NULL,
	"name" text NOT NULL,
	"start_date" date NOT NULL,
	"end_date" date NOT NULL,
	"status" text DEFAULT 'planned' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "term_year_number" UNIQUE("year","number"),
	CONSTRAINT "term_number_1_to_4" CHECK ("term"."number" between 1 and 4),
	CONSTRAINT "term_dates_in_order" CHECK ("term"."end_date" > "term"."start_date"),
	CONSTRAINT "term_status_known" CHECK ("term"."status" in ('planned', 'active', 'closed'))
);
--> statement-breakpoint
ALTER TABLE "course" ADD CONSTRAINT "course_next_course_id_course_id_fk" FOREIGN KEY ("next_course_id") REFERENCES "public"."course"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "syllabus_topic" ADD CONSTRAINT "syllabus_topic_course_id_course_id_fk" FOREIGN KEY ("course_id") REFERENCES "public"."course"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "syllabus_topic_course_idx" ON "syllabus_topic" USING btree ("course_id","position");