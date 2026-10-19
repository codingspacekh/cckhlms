CREATE TABLE "lesson_attachment" (
	"id" text PRIMARY KEY NOT NULL,
	"lesson_id" text NOT NULL,
	"filename" text NOT NULL,
	"content_type" text NOT NULL,
	"size" integer NOT NULL,
	"uploaded_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "lesson_attachment_size_positive" CHECK ("lesson_attachment"."size" > 0)
);
--> statement-breakpoint
ALTER TABLE "lesson_attachment" ADD CONSTRAINT "lesson_attachment_lesson_id_lesson_id_fk" FOREIGN KEY ("lesson_id") REFERENCES "public"."lesson"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lesson_attachment" ADD CONSTRAINT "lesson_attachment_uploaded_by_user_id_fk" FOREIGN KEY ("uploaded_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "lesson_attachment_lesson_idx" ON "lesson_attachment" USING btree ("lesson_id");