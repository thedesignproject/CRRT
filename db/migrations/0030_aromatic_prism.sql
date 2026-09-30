CREATE TABLE "widget_auth_sessions" (
	"code_hash" text PRIMARY KEY NOT NULL,
	"state_hash" text NOT NULL,
	"pkce_challenge" text NOT NULL,
	"user_id" uuid NOT NULL,
	"project_key" text NOT NULL,
	"origin" text NOT NULL,
	"display_name" text NOT NULL,
	"handoff_expires_at" timestamp with time zone NOT NULL,
	"token_hash" text,
	"expires_at" timestamp with time zone NOT NULL,
	CONSTRAINT "widget_auth_sessions_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
ALTER TABLE "widget_auth_sessions" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "widget_auth_sessions" ADD CONSTRAINT "widget_auth_sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "widget_auth_sessions" ADD CONSTRAINT "widget_auth_sessions_project_key_projects_public_key_fk" FOREIGN KEY ("project_key") REFERENCES "public"."projects"("public_key") ON DELETE cascade ON UPDATE no action;