CREATE TABLE "enrolment" (
	"id" text PRIMARY KEY NOT NULL,
	"class_id" text NOT NULL,
	"student_id" text NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"enrolled_on" date NOT NULL,
	"ended_on" date,
	"transferred_from_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "enrolment_status_known" CHECK ("enrolment"."status" in ('active', 'withdrawn', 'completed')),
	CONSTRAINT "enrolment_end_after_start" CHECK ("enrolment"."ended_on" is null or "enrolment"."ended_on" >= "enrolment"."enrolled_on")
);
--> statement-breakpoint
ALTER TABLE "enrolment" ADD CONSTRAINT "enrolment_class_id_class_id_fk" FOREIGN KEY ("class_id") REFERENCES "public"."class"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "enrolment" ADD CONSTRAINT "enrolment_student_id_user_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "enrolment" ADD CONSTRAINT "enrolment_transferred_from_id_enrolment_id_fk" FOREIGN KEY ("transferred_from_id") REFERENCES "public"."enrolment"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "enrolment_class_idx" ON "enrolment" USING btree ("class_id");--> statement-breakpoint
CREATE INDEX "enrolment_student_idx" ON "enrolment" USING btree ("student_id");--> statement-breakpoint
CREATE UNIQUE INDEX "enrolment_one_active" ON "enrolment" USING btree ("class_id","student_id") WHERE "enrolment"."status" = 'active';