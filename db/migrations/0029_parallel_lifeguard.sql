CREATE TABLE "billing_accounts" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"customer_id" text,
	"subscription_id" text,
	"subscription_status" text,
	"price_id" text,
	"period_end" timestamp with time zone,
	"cancel_at_period_end" boolean DEFAULT false NOT NULL,
	"checkout_attempt" uuid DEFAULT gen_random_uuid() NOT NULL,
	"checkout_session_id" text,
	"lock_token" uuid,
	"lock_expires_at" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "billing_accounts_customer_id_unique" UNIQUE("customer_id"),
	CONSTRAINT "billing_accounts_subscription_id_unique" UNIQUE("subscription_id")
);
--> statement-breakpoint
ALTER TABLE "billing_accounts" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "billing_webhook_events" (
	"event_id" text PRIMARY KEY NOT NULL,
	"event_type" text NOT NULL,
	"processed_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "billing_webhook_events" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "billing_accounts" ADD CONSTRAINT "billing_accounts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE restrict ON UPDATE no action;