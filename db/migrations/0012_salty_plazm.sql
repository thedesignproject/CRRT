CREATE TABLE "github_user_installations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"installation_id" text NOT NULL,
	"github_account_id" text NOT NULL,
	"github_account_login" text NOT NULL,
	"github_account_type" text NOT NULL,
	"last_verified_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "github_user_installations_account_type_check" CHECK ("github_user_installations"."github_account_type" in ('User', 'Organization'))
);
--> statement-breakpoint
ALTER TABLE "github_user_installations" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "github_user_installations" ADD CONSTRAINT "github_user_installations_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_repo_configs" ADD COLUMN "github_installation_id" text;--> statement-breakpoint
ALTER TABLE "project_repo_configs" ADD COLUMN "github_connection_version" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
CREATE FUNCTION public.write_github_repo_connection_if_admin(
	p_project_key text,
	p_user_id uuid,
	p_expected_version integer,
	p_repo_url text,
	p_github_owner text,
	p_github_repo text,
	p_github_installation_id text
)
RETURNS SETOF public.project_repo_configs
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $$
	UPDATE public.project_repo_configs AS config
	SET
		repo_url = p_repo_url,
		github_owner = p_github_owner,
		github_repo = p_github_repo,
		github_installation_id = p_github_installation_id,
		github_connection_version = config.github_connection_version + 1,
		updated_at = now()
	WHERE config.project_key = p_project_key
		AND config.github_connection_version = p_expected_version
		AND EXISTS (
			SELECT 1
			FROM public.project_members AS member
			WHERE member.project_key = config.project_key
				AND member.user_id = p_user_id
				AND member.role = 'admin'
		)
	RETURNING config.*;
$$;--> statement-breakpoint
REVOKE ALL ON FUNCTION public.write_github_repo_connection_if_admin(text, uuid, integer, text, text, text, text) FROM PUBLIC;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.write_github_repo_connection_if_admin(text, uuid, integer, text, text, text, text) TO service_role;--> statement-breakpoint
CREATE INDEX "github_user_installations_user_id_idx" ON "github_user_installations" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "github_user_installations_user_installation_unique" ON "github_user_installations" USING btree ("user_id","installation_id");
