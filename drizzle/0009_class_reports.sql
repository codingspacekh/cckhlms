CREATE TABLE "class_report" (
	"id" text PRIMARY KEY NOT NULL,
	"session_id" text NOT NULL,
	"comment" text DEFAULT '' NOT NULL,
	"author_id" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "class_report_session_id_unique" UNIQUE("session_id")
);
--> statement-breakpoint
CREATE TABLE "class_report_topic" (
	"report_id" text NOT NULL,
	"topic_id" text NOT NULL,
	CONSTRAINT "class_report_topic_report_id_topic_id_pk" PRIMARY KEY("report_id","topic_id")
);
--> statement-breakpoint
ALTER TABLE "class_report" ADD CONSTRAINT "class_report_session_id_class_session_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."class_session"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "class_report" ADD CONSTRAINT "class_report_author_id_user_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "class_report_topic" ADD CONSTRAINT "class_report_topic_report_id_class_report_id_fk" FOREIGN KEY ("report_id") REFERENCES "public"."class_report"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "class_report_topic" ADD CONSTRAINT "class_report_topic_topic_id_syllabus_topic_id_fk" FOREIGN KEY ("topic_id") REFERENCES "public"."syllabus_topic"("id") ON DELETE cascade ON UPDATE no action;