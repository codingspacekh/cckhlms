CREATE TABLE "lesson" (
	"id" text PRIMARY KEY NOT NULL,
	"session_id" text NOT NULL,
	"title" text NOT NULL,
	"content_md" text DEFAULT '' NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"publish_at" timestamp with time zone,
	"author_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "lesson_session_id_unique" UNIQUE("session_id"),
	CONSTRAINT "lesson_status_known" CHECK ("lesson"."status" in ('draft', 'published'))
);
--> statement-breakpoint
CREATE TABLE "lesson_topic" (
	"lesson_id" text NOT NULL,
	"topic_id" text NOT NULL,
	CONSTRAINT "lesson_topic_lesson_id_topic_id_pk" PRIMARY KEY("lesson_id","topic_id")
);
--> statement-breakpoint
ALTER TABLE "lesson" ADD CONSTRAINT "lesson_session_id_class_session_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."class_session"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lesson" ADD CONSTRAINT "lesson_author_id_user_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lesson_topic" ADD CONSTRAINT "lesson_topic_lesson_id_lesson_id_fk" FOREIGN KEY ("lesson_id") REFERENCES "public"."lesson"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lesson_topic" ADD CONSTRAINT "lesson_topic_topic_id_syllabus_topic_id_fk" FOREIGN KEY ("topic_id") REFERENCES "public"."syllabus_topic"("id") ON DELETE cascade ON UPDATE no action;