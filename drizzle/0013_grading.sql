ALTER TABLE "submission" ADD COLUMN "score" numeric(6, 1);--> statement-breakpoint
ALTER TABLE "submission" ADD COLUMN "feedback_md" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "submission" ADD COLUMN "graded_by" text;--> statement-breakpoint
ALTER TABLE "submission" ADD COLUMN "graded_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "submission" ADD COLUMN "returned_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "submission" ADD CONSTRAINT "submission_graded_by_user_id_fk" FOREIGN KEY ("graded_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "submission" ADD CONSTRAINT "submission_score_positive" CHECK ("submission"."score" >= 0);