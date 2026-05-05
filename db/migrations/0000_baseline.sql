CREATE TABLE "agent_presence" (
	"share_id" uuid NOT NULL,
	"agent_id" text NOT NULL,
	"status" text NOT NULL,
	"summary" text,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "agent_presence_share_id_agent_id_pk" PRIMARY KEY("share_id","agent_id")
);
--> statement-breakpoint
CREATE TABLE "comments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" text,
	"url" text,
	"x" double precision,
	"y" double precision,
	"element" text,
	"comment" text,
	"status" text DEFAULT 'pending',
	"implementation_status" text DEFAULT 'unassigned',
	"claimed_by_agent_id" text,
	"created_by" text DEFAULT 'public',
	"image_url" text,
	"author_name" text,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "feedback_events" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "feedback_events_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"share_id" uuid NOT NULL,
	"comment_id" uuid,
	"actor_type" text NOT NULL,
	"actor_id" text NOT NULL,
	"event_type" text NOT NULL,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "feedback_operation_keys" (
	"share_id" uuid NOT NULL,
	"agent_id" text NOT NULL,
	"idempotency_key" text NOT NULL,
	"feedback_event_id" bigint,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "feedback_operation_keys_share_id_agent_id_idempotency_key_pk" PRIMARY KEY("share_id","agent_id","idempotency_key")
);
--> statement-breakpoint
CREATE TABLE "feedback_share_items" (
	"share_id" uuid NOT NULL,
	"comment_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "feedback_share_items_share_id_comment_id_pk" PRIMARY KEY("share_id","comment_id")
);
--> statement-breakpoint
CREATE TABLE "feedback_shares" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" text NOT NULL,
	"scope_type" text NOT NULL,
	"scope_page_url" text,
	"slug" text NOT NULL,
	"access_token_hash" text NOT NULL,
	"access_token_ciphertext" text NOT NULL,
	"created_by" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "feedback_shares_slug_unique" UNIQUE("slug"),
	CONSTRAINT "feedback_shares_scope_type_check" CHECK ("feedback_shares"."scope_type" in ('page', 'selection', 'project'))
);
--> statement-breakpoint
CREATE TABLE "project_repo_configs" (
	"project_key" text PRIMARY KEY NOT NULL,
	"repo_url" text,
	"local_path" text,
	"default_branch" text DEFAULT 'main' NOT NULL,
	"install_command" text,
	"dev_command" text,
	"test_command" text,
	"build_command" text,
	"agent_instructions" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "projects" (
	"public_key" text PRIMARY KEY NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"allowed_origins" text[] DEFAULT '{}' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "projects_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
ALTER TABLE "agent_presence" ADD CONSTRAINT "agent_presence_share_id_feedback_shares_id_fk" FOREIGN KEY ("share_id") REFERENCES "public"."feedback_shares"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "feedback_events" ADD CONSTRAINT "feedback_events_share_id_feedback_shares_id_fk" FOREIGN KEY ("share_id") REFERENCES "public"."feedback_shares"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "feedback_events" ADD CONSTRAINT "feedback_events_comment_id_comments_id_fk" FOREIGN KEY ("comment_id") REFERENCES "public"."comments"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "feedback_operation_keys" ADD CONSTRAINT "feedback_operation_keys_share_id_feedback_shares_id_fk" FOREIGN KEY ("share_id") REFERENCES "public"."feedback_shares"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "feedback_operation_keys" ADD CONSTRAINT "feedback_operation_keys_feedback_event_id_feedback_events_id_fk" FOREIGN KEY ("feedback_event_id") REFERENCES "public"."feedback_events"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "feedback_share_items" ADD CONSTRAINT "feedback_share_items_share_id_feedback_shares_id_fk" FOREIGN KEY ("share_id") REFERENCES "public"."feedback_shares"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "feedback_share_items" ADD CONSTRAINT "feedback_share_items_comment_id_comments_id_fk" FOREIGN KEY ("comment_id") REFERENCES "public"."comments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "feedback_shares" ADD CONSTRAINT "feedback_shares_project_id_projects_public_key_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("public_key") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_repo_configs" ADD CONSTRAINT "project_repo_configs_project_key_projects_public_key_fk" FOREIGN KEY ("project_key") REFERENCES "public"."projects"("public_key") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "agent_presence_share_seen_idx" ON "agent_presence" USING btree ("share_id","last_seen_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "comments_project_created_idx" ON "comments" USING btree ("project_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "comments_project_url_idx" ON "comments" USING btree ("project_id","url","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "comments_project_status_idx" ON "comments" USING btree ("project_id","status","implementation_status");--> statement-breakpoint
CREATE INDEX "feedback_events_share_id_idx" ON "feedback_events" USING btree ("share_id","id");--> statement-breakpoint
CREATE UNIQUE INDEX "feedback_shares_one_project_scope_per_project" ON "feedback_shares" USING btree ("project_id") WHERE scope_type = 'project' and revoked_at is null;