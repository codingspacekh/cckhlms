CREATE TABLE "support_line" (
	"id" text PRIMARY KEY NOT NULL,
	"date" date NOT NULL,
	"start_time" text NOT NULL,
	"minutes" smallint NOT NULL,
	"meeting_url" text NOT NULL,
	"message" text DEFAULT '' NOT NULL,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"cancelled_at" timestamp with time zone,
	CONSTRAINT "support_line_start_time_format" CHECK ("support_line"."start_time" ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'),
	CONSTRAINT "support_line_minutes" CHECK ("support_line"."minutes" in (30, 45, 60, 90)),
	CONSTRAINT "support_line_lengths" CHECK (char_length("support_line"."meeting_url") <= 500 and char_length("support_line"."message") <= 500)
);
--> statement-breakpoint
CREATE TABLE "support_line_student" (
	"support_line_id" text NOT NULL,
	"enrolment_id" text NOT NULL,
	CONSTRAINT "support_line_student_support_line_id_enrolment_id_pk" PRIMARY KEY("support_line_id","enrolment_id")
);
--> statement-breakpoint
ALTER TABLE "support_line" ADD CONSTRAINT "support_line_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "support_line_student" ADD CONSTRAINT "support_line_student_support_line_id_support_line_id_fk" FOREIGN KEY ("support_line_id") REFERENCES "public"."support_line"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "support_line_student" ADD CONSTRAINT "support_line_student_enrolment_id_enrolment_id_fk" FOREIGN KEY ("enrolment_id") REFERENCES "public"."enrolment"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "support_line_date_idx" ON "support_line" USING btree ("date");--> statement-breakpoint
CREATE INDEX "support_line_student_enrolment_idx" ON "support_line_student" USING btree ("enrolment_id");