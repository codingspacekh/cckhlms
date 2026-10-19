CREATE TABLE "assessment" (
	"id" text PRIMARY KEY NOT NULL,
	"class_id" text NOT NULL,
	"session_id" text NOT NULL,
	"kind" text NOT NULL,
	"title" text NOT NULL,
	"instructions_md" text DEFAULT '' NOT NULL,
	"language" text NOT NULL,
	"max_score" integer NOT NULL,
	"due_mode" text NOT NULL,
	"due_at" timestamp with time zone,
	"allow_late" boolean DEFAULT true NOT NULL,
	"late_penalty_pct" integer DEFAULT 10 NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"author_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "assessment_kind_known" CHECK ("assessment"."kind" in ('classwork', 'homework', 'exam')),
	CONSTRAINT "assessment_language_known" CHECK ("assessment"."language" in ('python', 'java', 'web', 'paper')),
	CONSTRAINT "assessment_status_known" CHECK ("assessment"."status" in ('draft', 'published')),
	CONSTRAINT "assessment_max_score_range" CHECK ("assessment"."max_score" between 1 and 1000),
	CONSTRAINT "assessment_penalty_range" CHECK ("assessment"."late_penalty_pct" between 0 and 100),
	CONSTRAINT "assessment_due_mode_known" CHECK ("assessment"."due_mode" in ('next_session', 'session_end', 'fixed')),
	CONSTRAINT "assessment_due_at_when_fixed" CHECK (("assessment"."due_mode" = 'fixed') = ("assessment"."due_at" is not null))
);
--> statement-breakpoint
ALTER TABLE "assessment" ADD CONSTRAINT "assessment_class_id_class_id_fk" FOREIGN KEY ("class_id") REFERENCES "public"."class"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assessment" ADD CONSTRAINT "assessment_session_id_class_session_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."class_session"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assessment" ADD CONSTRAINT "assessment_author_id_user_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "assessment_class_idx" ON "assessment" USING btree ("class_id");