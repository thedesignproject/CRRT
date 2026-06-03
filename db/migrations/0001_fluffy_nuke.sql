CREATE TABLE "project_invites" (
	"project_key" text NOT NULL,
	"email" text NOT NULL,
	"role" text DEFAULT 'member' NOT NULL,
	"invited_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "project_invites_project_key_email_pk" PRIMARY KEY("project_key","email"),
	CONSTRAINT "project_invites_role_check" CHECK ("project_invites"."role" in ('admin', 'member')),
	CONSTRAINT "project_invites_email_lower_check" CHECK ("project_invites"."email" = lower("project_invites"."email"))
);
--> statement-breakpoint
CREATE TABLE "project_members" (
	"project_key" text NOT NULL,
	"user_id" uuid NOT NULL,
	"role" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "project_members_project_key_user_id_pk" PRIMARY KEY("project_key","user_id"),
	CONSTRAINT "project_members_role_check" CHECK ("project_members"."role" in ('admin', 'member'))
);
--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "claimable" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "project_invites" ADD CONSTRAINT "project_invites_project_key_projects_public_key_fk" FOREIGN KEY ("project_key") REFERENCES "public"."projects"("public_key") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_invites" ADD CONSTRAINT "project_invites_invited_by_auth_users_id_fk" FOREIGN KEY ("invited_by") REFERENCES "auth"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_members" ADD CONSTRAINT "project_members_project_key_projects_public_key_fk" FOREIGN KEY ("project_key") REFERENCES "public"."projects"("public_key") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_members" ADD CONSTRAINT "project_members_user_id_auth_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "project_invites_email_idx" ON "project_invites" USING btree ("email");--> statement-breakpoint
CREATE INDEX "project_members_user_id_idx" ON "project_members" USING btree ("user_id");