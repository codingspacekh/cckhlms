CREATE TABLE "playground_project" (
	"id" text PRIMARY KEY NOT NULL,
	"owner_id" text NOT NULL,
	"name" text NOT NULL,
	"language" text NOT NULL,
	"files" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "playground_project_language_known" CHECK ("playground_project"."language" in ('python', 'java', 'web'))
);
--> statement-breakpoint
ALTER TABLE "playground_project" ADD CONSTRAINT "playground_project_owner_id_user_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "playground_project_name_unique" ON "playground_project" USING btree ("owner_id",lower("name"));