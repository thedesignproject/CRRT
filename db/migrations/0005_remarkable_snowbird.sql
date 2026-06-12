ALTER TABLE "comments" ADD COLUMN "target_type" text DEFAULT 'element_point';--> statement-breakpoint
ALTER TABLE "comments" ADD COLUMN "anchor" jsonb;