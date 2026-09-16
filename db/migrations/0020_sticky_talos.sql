CREATE TABLE "comment_external_work" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" text NOT NULL,
	"comment_id" uuid NOT NULL,
	"provider" text NOT NULL,
	"external_id" text NOT NULL,
	"external_key" text NOT NULL,
	"external_url" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "comment_external_work_provider_check" CHECK ("comment_external_work"."provider" in ('linear', 'jira'))
);
--> statement-breakpoint
ALTER TABLE "comment_external_work" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "project_integrations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_key" text NOT NULL,
	"provider" text NOT NULL,
	"access_token_ciphertext" text NOT NULL,
	"refresh_token_ciphertext" text,
	"token_expires_at" timestamp with time zone,
	"workspace_id" text NOT NULL,
	"workspace_name" text NOT NULL,
	"container_id" text,
	"container_name" text,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "project_integrations_provider_check" CHECK ("project_integrations"."provider" in ('linear', 'jira'))
);
--> statement-breakpoint
ALTER TABLE "project_integrations" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "comment_external_work" ADD CONSTRAINT "comment_external_work_project_id_projects_public_key_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("public_key") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comment_external_work" ADD CONSTRAINT "comment_external_work_comment_id_comments_id_fk" FOREIGN KEY ("comment_id") REFERENCES "public"."comments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_integrations" ADD CONSTRAINT "project_integrations_project_key_projects_public_key_fk" FOREIGN KEY ("project_key") REFERENCES "public"."projects"("public_key") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_integrations" ADD CONSTRAINT "project_integrations_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "comment_external_work_comment_provider_unique" ON "comment_external_work" USING btree ("comment_id","provider");--> statement-breakpoint
CREATE INDEX "comment_external_work_project_created_idx" ON "comment_external_work" USING btree ("project_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE UNIQUE INDEX "project_integrations_project_provider_unique" ON "project_integrations" USING btree ("project_key","provider");