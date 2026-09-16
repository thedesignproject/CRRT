CREATE TABLE "extension_auth_handoffs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code_hash" text NOT NULL,
	"state_hash" text NOT NULL,
	"pkce_challenge" text NOT NULL,
	"user_id" uuid NOT NULL,
	"extension_id" text NOT NULL,
	"redirect_uri" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"consumed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "extension_auth_handoffs_code_hash_check" CHECK ("extension_auth_handoffs"."code_hash" ~ '^[0-9a-f]{64}$'),
	CONSTRAINT "extension_auth_handoffs_state_hash_check" CHECK ("extension_auth_handoffs"."state_hash" ~ '^[0-9a-f]{64}$'),
	CONSTRAINT "extension_auth_handoffs_pkce_challenge_check" CHECK ("extension_auth_handoffs"."pkce_challenge" ~ '^[A-Za-z0-9_-]{43}$'),
	CONSTRAINT "extension_auth_handoffs_extension_id_check" CHECK ("extension_auth_handoffs"."extension_id" ~ '^[a-p]{32}$'),
	CONSTRAINT "extension_auth_handoffs_redirect_uri_check" CHECK ("extension_auth_handoffs"."redirect_uri" = 'https://' || "extension_auth_handoffs"."extension_id" || '.chromiumapp.org/crrt-auth'),
	CONSTRAINT "extension_auth_handoffs_expiry_check" CHECK ("extension_auth_handoffs"."expires_at" > "extension_auth_handoffs"."created_at"),
	CONSTRAINT "extension_auth_handoffs_consumed_at_check" CHECK ("extension_auth_handoffs"."consumed_at" is null or "extension_auth_handoffs"."consumed_at" >= "extension_auth_handoffs"."created_at")
);
--> statement-breakpoint
ALTER TABLE "extension_auth_handoffs" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "extension_auth_handoffs" ADD CONSTRAINT "extension_auth_handoffs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "extension_auth_handoffs_code_hash_unique" ON "extension_auth_handoffs" USING btree ("code_hash");--> statement-breakpoint
CREATE INDEX "extension_auth_handoffs_expires_at_idx" ON "extension_auth_handoffs" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "extension_auth_handoffs_cleanup_idx" ON "extension_auth_handoffs" USING btree ("consumed_at","expires_at");--> statement-breakpoint
CREATE OR REPLACE FUNCTION public.consume_extension_auth_handoff(
	p_code_hash text,
	p_state_hash text,
	p_pkce_challenge text,
	p_extension_id text,
	p_redirect_uri text
)
RETURNS TABLE(user_id uuid)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
	RETURN QUERY
	UPDATE public.extension_auth_handoffs AS handoff
	SET consumed_at = now()
	WHERE handoff.code_hash = p_code_hash
		AND handoff.state_hash = p_state_hash
		AND handoff.pkce_challenge = p_pkce_challenge
		AND handoff.extension_id = p_extension_id
		AND handoff.redirect_uri = p_redirect_uri
		AND handoff.expires_at > now()
		AND handoff.consumed_at IS NULL
	RETURNING handoff.user_id;
END;
$$;--> statement-breakpoint
REVOKE ALL ON FUNCTION public.consume_extension_auth_handoff(text, text, text, text, text) FROM PUBLIC;--> statement-breakpoint
REVOKE ALL ON FUNCTION public.consume_extension_auth_handoff(text, text, text, text, text) FROM anon;--> statement-breakpoint
REVOKE ALL ON FUNCTION public.consume_extension_auth_handoff(text, text, text, text, text) FROM authenticated;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.consume_extension_auth_handoff(text, text, text, text, text) TO service_role;
