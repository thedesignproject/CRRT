CREATE TABLE "comment_email_batches" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"delivery_id" uuid NOT NULL,
	"batch_index" integer NOT NULL,
	"body" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"next_attempt_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"lease_token" uuid,
	"last_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "comment_email_batches_status_check" CHECK ("comment_email_batches"."status" in ('pending', 'sent', 'failed'))
);
--> statement-breakpoint
ALTER TABLE "comment_email_batches" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE UNIQUE INDEX "comment_email_batches_delivery_batch_unique" ON "comment_email_batches" USING btree ("delivery_id","batch_index");--> statement-breakpoint
CREATE INDEX "comment_email_batches_due_idx" ON "comment_email_batches" USING btree ("status","next_attempt_at");