CREATE TABLE "attendance" (
	"session_id" text NOT NULL,
	"enrolment_id" text NOT NULL,
	"status" text NOT NULL,
	"note" text,
	"marked_by" text,
	"marked_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "attendance_session_id_enrolment_id_pk" PRIMARY KEY("session_id","enrolment_id"),
	CONSTRAINT "attendance_status_known" CHECK ("attendance"."status" in ('present', 'late', 'absent', 'excused'))
);
--> statement-breakpoint
ALTER TABLE "attendance" ADD CONSTRAINT "attendance_session_id_class_session_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."class_session"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attendance" ADD CONSTRAINT "attendance_enrolment_id_enrolment_id_fk" FOREIGN KEY ("enrolment_id") REFERENCES "public"."enrolment"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attendance" ADD CONSTRAINT "attendance_marked_by_user_id_fk" FOREIGN KEY ("marked_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "attendance_enrolment_idx" ON "attendance" USING btree ("enrolment_id");