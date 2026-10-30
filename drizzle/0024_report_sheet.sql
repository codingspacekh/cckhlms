CREATE TABLE "class_report_student" (
	"report_id" text NOT NULL,
	"enrolment_id" text NOT NULL,
	"participation" text,
	"comment" text DEFAULT '' NOT NULL,
	"needs_support" boolean DEFAULT false NOT NULL,
	"note" text DEFAULT '' NOT NULL,
	"updated_by" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "class_report_student_report_id_enrolment_id_pk" PRIMARY KEY("report_id","enrolment_id"),
	CONSTRAINT "class_report_student_participation" CHECK ("class_report_student"."participation" is null or "class_report_student"."participation" in ('active', 'not_active')),
	CONSTRAINT "class_report_student_lengths" CHECK (char_length("class_report_student"."comment") <= 500 and char_length("class_report_student"."note") <= 500)
);
--> statement-breakpoint
ALTER TABLE "class_report_student" ADD CONSTRAINT "class_report_student_report_id_class_report_id_fk" FOREIGN KEY ("report_id") REFERENCES "public"."class_report"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "class_report_student" ADD CONSTRAINT "class_report_student_enrolment_id_enrolment_id_fk" FOREIGN KEY ("enrolment_id") REFERENCES "public"."enrolment"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "class_report_student" ADD CONSTRAINT "class_report_student_updated_by_user_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "class_report_student_enrolment_idx" ON "class_report_student" USING btree ("enrolment_id");