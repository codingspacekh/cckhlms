ALTER TABLE "enrolment" ADD COLUMN "promoted_from_id" text;--> statement-breakpoint
ALTER TABLE "class" ADD COLUMN "promoted_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "enrolment" ADD CONSTRAINT "enrolment_promoted_from_id_enrolment_id_fk" FOREIGN KEY ("promoted_from_id") REFERENCES "public"."enrolment"("id") ON DELETE set null ON UPDATE no action;