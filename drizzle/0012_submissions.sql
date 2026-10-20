CREATE TABLE "submission" (
	"id" text PRIMARY KEY NOT NULL,
	"assessment_id" text NOT NULL,
	"student_id" text NOT NULL,
	"version" integer NOT NULL,
	"files" jsonb NOT NULL,
	"late" boolean DEFAULT false NOT NULL,
	"submitted_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "submission_version_unique" UNIQUE("assessment_id","student_id","version"),
	CONSTRAINT "submission_version_positive" CHECK ("submission"."version" >= 1)
);
--> statement-breakpoint
ALTER TABLE "submission" ADD CONSTRAINT "submission_assessment_id_assessment_id_fk" FOREIGN KEY ("assessment_id") REFERENCES "public"."assessment"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "submission" ADD CONSTRAINT "submission_student_id_user_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "submission_assessment_idx" ON "submission" USING btree ("assessment_id");