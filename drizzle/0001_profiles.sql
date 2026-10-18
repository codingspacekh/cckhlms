CREATE TABLE "student_profile" (
	"user_id" text PRIMARY KEY NOT NULL,
	"guardian_name" text,
	"guardian_phone" text,
	"notes" text
);
--> statement-breakpoint
CREATE TABLE "teacher_profile" (
	"user_id" text PRIMARY KEY NOT NULL,
	"phone" text,
	"notes" text
);
--> statement-breakpoint
ALTER TABLE "student_profile" ADD CONSTRAINT "student_profile_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "teacher_profile" ADD CONSTRAINT "teacher_profile_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;