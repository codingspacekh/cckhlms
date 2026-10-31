ALTER TABLE "submission" ADD COLUMN "file_key" text;--> statement-breakpoint
ALTER TABLE "submission" ADD COLUMN "file_name" text;--> statement-breakpoint
ALTER TABLE "submission" ADD COLUMN "file_size" integer;--> statement-breakpoint
ALTER TABLE "submission" ADD COLUMN "file_sha256" text;--> statement-breakpoint
ALTER TABLE "submission" ADD COLUMN "link_url" text;--> statement-breakpoint
ALTER TABLE "submission" ADD CONSTRAINT "submission_file_complete" CHECK (("submission"."file_key" is null) = ("submission"."file_name" is null) and ("submission"."file_key" is null) = ("submission"."file_size" is null) and ("submission"."file_key" is null) = ("submission"."file_sha256" is null));--> statement-breakpoint
ALTER TABLE "submission" ADD CONSTRAINT "submission_link_https" CHECK ("submission"."link_url" is null or ("submission"."link_url" like 'https://%' and char_length("submission"."link_url") <= 500));