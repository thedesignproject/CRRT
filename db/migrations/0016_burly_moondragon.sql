CREATE TABLE IF NOT EXISTS "extension_comment_limits" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"attempts" timestamp with time zone[] DEFAULT '{}'::timestamptz[] NOT NULL,
	"version" uuid DEFAULT gen_random_uuid() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "extension_comment_limits" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "comments" ADD COLUMN IF NOT EXISTS "source" text DEFAULT 'widget' NOT NULL;--> statement-breakpoint
ALTER TABLE "comments" ADD COLUMN IF NOT EXISTS "created_by_user_id" uuid;--> statement-breakpoint
ALTER TABLE "comments" ADD COLUMN IF NOT EXISTS "page_hostname" text;--> statement-breakpoint
ALTER TABLE "comments" ADD COLUMN IF NOT EXISTS "screenshot_storage_path" text;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "extension_comment_limits" ADD CONSTRAINT "extension_comment_limits_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "comments" ADD CONSTRAINT "comments_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "auth"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "comments_extension_author_created_idx" ON "comments" USING btree ("created_by_user_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "comments_extension_author_url_idx" ON "comments" USING btree ("created_by_user_id","url","created_at" DESC NULLS LAST);--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "comments" ADD CONSTRAINT "comments_source_check" CHECK ("comments"."source" in ('widget', 'extension'));
EXCEPTION WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "comments" ADD CONSTRAINT "comments_extension_ownership_check" CHECK ("comments"."source" <> 'extension' or ("comments"."created_by_user_id" is not null and "comments"."page_hostname" is not null and "comments"."project_id" is null));
EXCEPTION WHEN duplicate_object THEN null;
END $$;
