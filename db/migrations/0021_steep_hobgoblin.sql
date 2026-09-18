ALTER TABLE "comment_external_work" ALTER COLUMN "external_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "comment_external_work" ALTER COLUMN "external_key" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "comment_external_work" ALTER COLUMN "external_url" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "comment_external_work" ADD COLUMN "state" text DEFAULT 'creating' NOT NULL;--> statement-breakpoint
ALTER TABLE "comment_external_work" ADD COLUMN "lease_token" uuid NOT NULL;--> statement-breakpoint
ALTER TABLE "comment_external_work" ADD COLUMN "lease_expires_at" timestamp with time zone NOT NULL;--> statement-breakpoint
ALTER TABLE "comment_external_work" ADD COLUMN "uncertain_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "comment_external_work" ADD COLUMN "updated_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "comment_external_work" ADD CONSTRAINT "comment_external_work_state_check" CHECK ("comment_external_work"."state" in ('creating', 'created'));--> statement-breakpoint
ALTER TABLE "comment_external_work" ADD CONSTRAINT "comment_external_work_result_check" CHECK ((
      ("comment_external_work"."state" = 'creating' and "comment_external_work"."external_id" is null and "comment_external_work"."external_key" is null and "comment_external_work"."external_url" is null)
      or
      ("comment_external_work"."state" = 'created' and "comment_external_work"."external_id" is not null and "comment_external_work"."external_key" is not null and "comment_external_work"."external_url" is not null)
    ));