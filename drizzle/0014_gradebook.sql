CREATE TABLE "excusal" (
	"assessment_id" text NOT NULL,
	"student_id" text NOT NULL,
	"excused_by" text,
	"excused_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "excusal_assessment_id_student_id_pk" PRIMARY KEY("assessment_id","student_id")
);
--> statement-breakpoint
ALTER TABLE "submission" ADD COLUMN "by_teacher" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "excusal" ADD CONSTRAINT "excusal_assessment_id_assessment_id_fk" FOREIGN KEY ("assessment_id") REFERENCES "public"."assessment"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "excusal" ADD CONSTRAINT "excusal_student_id_user_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "excusal" ADD CONSTRAINT "excusal_excused_by_user_id_fk" FOREIGN KEY ("excused_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;