CREATE TABLE "certificate" (
	"id" text PRIMARY KEY NOT NULL,
	"enrolment_id" text NOT NULL,
	"code" text NOT NULL,
	"template_version" smallint NOT NULL,
	"override_reason" text,
	"issued_by" text,
	"issued_at" timestamp with time zone DEFAULT now() NOT NULL,
	"revoked_at" timestamp with time zone,
	"revoked_by" text,
	"revoked_reason" text,
	CONSTRAINT "certificate_code_unique" UNIQUE("code"),
	CONSTRAINT "certificate_revoked_complete" CHECK (("certificate"."revoked_at" is null) = ("certificate"."revoked_reason" is null))
);
--> statement-breakpoint
ALTER TABLE "club_settings" ADD COLUMN "certificate_signer" text DEFAULT 'Club Director' NOT NULL;--> statement-breakpoint
ALTER TABLE "certificate" ADD CONSTRAINT "certificate_enrolment_id_enrolment_id_fk" FOREIGN KEY ("enrolment_id") REFERENCES "public"."enrolment"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "certificate" ADD CONSTRAINT "certificate_issued_by_user_id_fk" FOREIGN KEY ("issued_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "certificate" ADD CONSTRAINT "certificate_revoked_by_user_id_fk" FOREIGN KEY ("revoked_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "certificate_one_valid" ON "certificate" USING btree ("enrolment_id") WHERE "certificate"."revoked_at" is null;