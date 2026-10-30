ALTER TABLE "class" ADD COLUMN "mode" text DEFAULT 'room' NOT NULL;--> statement-breakpoint
ALTER TABLE "class" ADD COLUMN "meeting_url" text;--> statement-breakpoint
ALTER TABLE "class" ADD CONSTRAINT "class_place" CHECK (("class"."mode" = 'room' and "class"."meeting_url" is null) or ("class"."mode" = 'online' and "class"."room" is null and "class"."meeting_url" is not null));