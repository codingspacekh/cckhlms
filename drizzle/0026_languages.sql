CREATE TABLE "language" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"built_in" boolean DEFAULT false NOT NULL,
	"by_file" boolean DEFAULT false NOT NULL,
	"file_types" text[] DEFAULT '{}'::text[] NOT NULL,
	"by_link" boolean DEFAULT false NOT NULL,
	"link_sites" text[] DEFAULT '{}'::text[] NOT NULL,
	"position" smallint DEFAULT 100 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "language_hand_in_known" CHECK ("language"."built_in" or "language"."by_file" or "language"."by_link"),
	CONSTRAINT "language_name_length" CHECK (char_length("language"."name") between 1 and 40)
);
--> statement-breakpoint
-- M18: the built-in languages, before courses and work point here.
INSERT INTO "language" ("id", "name", "built_in", "position") VALUES
	('python', 'Python', true, 1),
	('java', 'Java', true, 2),
	('web', 'HTML/CSS/JS', true, 3),
	('paper', 'Paper / in class', true, 4);
--> statement-breakpoint
ALTER TABLE "assessment" DROP CONSTRAINT "assessment_language_known";--> statement-breakpoint
ALTER TABLE "course" DROP CONSTRAINT "course_language_known";--> statement-breakpoint
CREATE UNIQUE INDEX "language_name_unique" ON "language" USING btree (lower("name"));--> statement-breakpoint
ALTER TABLE "assessment" ADD CONSTRAINT "assessment_language_language_id_fk" FOREIGN KEY ("language") REFERENCES "public"."language"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "course" ADD CONSTRAINT "course_default_language_language_id_fk" FOREIGN KEY ("default_language") REFERENCES "public"."language"("id") ON DELETE restrict ON UPDATE no action;