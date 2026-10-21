CREATE TABLE "notification_seen" (
	"user_id" text NOT NULL,
	"area" text NOT NULL,
	"seen_at" timestamp with time zone NOT NULL,
	CONSTRAINT "notification_seen_user_id_area_pk" PRIMARY KEY("user_id","area"),
	CONSTRAINT "notification_seen_area_known" CHECK ("notification_seen"."area" in ('student', 'teacher'))
);
--> statement-breakpoint
ALTER TABLE "assessment" ADD COLUMN "published_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "lesson" ADD COLUMN "published_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "notification_seen" ADD CONSTRAINT "notification_seen_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
-- Lessons and work published before this migration: the last edit is the best guess at when.
UPDATE "lesson" SET "published_at" = "updated_at" WHERE "status" = 'published';--> statement-breakpoint
UPDATE "assessment" SET "published_at" = "updated_at" WHERE "status" = 'published';
