CREATE TABLE "student_report" (
	"id" text PRIMARY KEY NOT NULL,
	"enrolment_id" text NOT NULL,
	"rating" text,
	"comment" text DEFAULT '' NOT NULL,
	"needs_support" boolean DEFAULT false NOT NULL,
	"support_note" text DEFAULT '' NOT NULL,
	"final_score" numeric(4, 1),
	"result" text,
	"reason" text,
	"calculated_score" numeric(4, 1),
	"exam_pct" numeric(4, 1),
	"classwork_pct" numeric(4, 1),
	"homework_pct" numeric(4, 1),
	"published_at" timestamp with time zone,
	"published_by" text,
	"author_id" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "student_report_enrolment_id_unique" UNIQUE("enrolment_id"),
	CONSTRAINT "student_report_rating_known" CHECK ("student_report"."rating" in ('excellent', 'good', 'developing', 'needs_work')),
	CONSTRAINT "student_report_result_known" CHECK ("student_report"."result" in ('pass', 'fail')),
	CONSTRAINT "student_report_final_score_range" CHECK ("student_report"."final_score" between 0 and 100),
	CONSTRAINT "student_report_support_note" CHECK ("student_report"."needs_support" or "student_report"."support_note" = ''),
	CONSTRAINT "student_report_published_complete" CHECK ("student_report"."published_at" is null or ("student_report"."result" is not null and "student_report"."rating" is not null))
);
--> statement-breakpoint
ALTER TABLE "student_report" ADD CONSTRAINT "student_report_enrolment_id_enrolment_id_fk" FOREIGN KEY ("enrolment_id") REFERENCES "public"."enrolment"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "student_report" ADD CONSTRAINT "student_report_published_by_user_id_fk" FOREIGN KEY ("published_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "student_report" ADD CONSTRAINT "student_report_author_id_user_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;