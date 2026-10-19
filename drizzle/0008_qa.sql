CREATE TABLE "post_report" (
	"id" text PRIMARY KEY NOT NULL,
	"post_type" text NOT NULL,
	"post_id" text NOT NULL,
	"reporter_id" text NOT NULL,
	"reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"resolved_by" text,
	"resolved_at" timestamp with time zone,
	"outcome" text,
	CONSTRAINT "post_report_type_known" CHECK ("post_report"."post_type" in ('question', 'reply')),
	CONSTRAINT "post_report_outcome_known" CHECK ("post_report"."outcome" is null or "post_report"."outcome" in ('restored', 'removed'))
);
--> statement-breakpoint
CREATE TABLE "question" (
	"id" text PRIMARY KEY NOT NULL,
	"lesson_id" text NOT NULL,
	"author_id" text NOT NULL,
	"body_md" text NOT NULL,
	"code_snippet" text,
	"accepted_reply_id" text,
	"visibility" text DEFAULT 'visible' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "question_visibility_known" CHECK ("question"."visibility" in ('visible', 'under_review', 'hidden'))
);
--> statement-breakpoint
CREATE TABLE "reply" (
	"id" text PRIMARY KEY NOT NULL,
	"question_id" text NOT NULL,
	"author_id" text NOT NULL,
	"body_md" text NOT NULL,
	"visibility" text DEFAULT 'visible' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "reply_visibility_known" CHECK ("reply"."visibility" in ('visible', 'under_review', 'hidden'))
);
--> statement-breakpoint
ALTER TABLE "post_report" ADD CONSTRAINT "post_report_reporter_id_user_id_fk" FOREIGN KEY ("reporter_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "post_report" ADD CONSTRAINT "post_report_resolved_by_user_id_fk" FOREIGN KEY ("resolved_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "question" ADD CONSTRAINT "question_lesson_id_lesson_id_fk" FOREIGN KEY ("lesson_id") REFERENCES "public"."lesson"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "question" ADD CONSTRAINT "question_author_id_user_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "question" ADD CONSTRAINT "question_accepted_reply_id_reply_id_fk" FOREIGN KEY ("accepted_reply_id") REFERENCES "public"."reply"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reply" ADD CONSTRAINT "reply_question_id_question_id_fk" FOREIGN KEY ("question_id") REFERENCES "public"."question"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reply" ADD CONSTRAINT "reply_author_id_user_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "post_report_post_idx" ON "post_report" USING btree ("post_type","post_id");--> statement-breakpoint
CREATE UNIQUE INDEX "post_report_one_open_per_reporter" ON "post_report" USING btree ("post_type","post_id","reporter_id") WHERE "post_report"."resolved_at" is null;--> statement-breakpoint
CREATE INDEX "question_lesson_idx" ON "question" USING btree ("lesson_id");--> statement-breakpoint
CREATE INDEX "reply_question_idx" ON "reply" USING btree ("question_id");