CREATE TABLE "appsumo_codes" (
	"code" text PRIMARY KEY NOT NULL,
	"redeemed_at" timestamp with time zone,
	"redeemed_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "appsumo_codes_code" CHECK (length("appsumo_codes"."code") between 1 and 128 AND "appsumo_codes"."code"=btrim("appsumo_codes"."code")),
	CONSTRAINT "appsumo_codes_redemption" CHECK ("appsumo_codes"."redeemed_by_user_id" is null or "appsumo_codes"."redeemed_at" is not null)
);
--> statement-breakpoint
ALTER TABLE "appsumo_codes" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "appsumo_redemption_attempts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "appsumo_redemption_attempts" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "appsumo_codes" ADD CONSTRAINT "appsumo_codes_redeemed_by_user_id_users_id_fk" FOREIGN KEY ("redeemed_by_user_id") REFERENCES "auth"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "appsumo_redemption_attempts" ADD CONSTRAINT "appsumo_redemption_attempts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "appsumo_codes_one_per_user" ON "appsumo_codes" USING btree ("redeemed_by_user_id") WHERE "appsumo_codes"."redeemed_by_user_id" is not null;--> statement-breakpoint
CREATE INDEX "appsumo_redemption_attempts_recent" ON "appsumo_redemption_attempts" USING btree ("user_id","created_at");--> statement-breakpoint
-- Serialize each user's redemptions so the per-user limit and the one-code rule
-- cannot race. The conditional UPDATE is the atomic claim: a concurrent caller
-- re-reads the committed row and finds it already redeemed.
CREATE FUNCTION public.redeem_appsumo_code(p_user uuid, p_code text, p_max_failures integer DEFAULT 10)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_code text; v_now timestamptz:=clock_timestamp();
BEGIN
  IF p_user IS NULL OR p_code IS NULL OR length(p_code) NOT BETWEEN 1 AND 128 THEN RETURN 'invalid_code'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('crrt-appsumo:' || p_user::text, 0));
  IF EXISTS(SELECT 1 FROM public.appsumo_codes WHERE redeemed_by_user_id=p_user) THEN RETURN 'already_has_plan'; END IF;
  IF (SELECT count(*) FROM public.appsumo_redemption_attempts
      WHERE user_id=p_user AND created_at>v_now-interval '1 hour')>=p_max_failures THEN
    RETURN 'rate_limited';
  END IF;
  UPDATE public.appsumo_codes SET redeemed_at=v_now, redeemed_by_user_id=p_user
    WHERE code=p_code AND redeemed_at IS NULL RETURNING code INTO v_code;
  IF v_code IS NULL THEN
    INSERT INTO public.appsumo_redemption_attempts(user_id) VALUES (p_user);
    IF EXISTS(SELECT 1 FROM public.appsumo_codes WHERE code=p_code) THEN RETURN 'already_redeemed'; END IF;
    RETURN 'invalid_code';
  END IF;
  INSERT INTO public.billing_accounts(user_id,is_legacy) VALUES (p_user,true)
    ON CONFLICT (user_id) DO UPDATE SET is_legacy=true, updated_at=now();
  RETURN 'redeemed';
END;
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION public.redeem_appsumo_code(uuid,text,integer) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.redeem_appsumo_code(uuid,text,integer) TO service_role;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION public.cloud_entitlements(p_owner uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE b public.billing_accounts%ROWTYPE; v_projects integer; v_users integer; v_writes boolean:=false;
BEGIN
  SELECT * INTO b FROM public.cloud_effective_account(p_owner);
  SELECT count(*) INTO v_projects FROM public.project_members WHERE user_id=p_owner AND is_owner;
  SELECT count(*) INTO v_users FROM public.cloud_internal_identities(p_owner);
  BEGIN PERFORM public.cloud_validate_write(p_owner); v_writes:=true;
    EXCEPTION WHEN raise_exception THEN v_writes:=false; END;
  RETURN jsonb_build_object('mode',CASE WHEN public.cloud_enabled() THEN 'cloud' ELSE 'community' END,
    'isLegacy',coalesce(b.is_legacy,false),'plan',b.plan,'status',coalesce(b.subscription_status,'none'),'canWrite',v_writes,'trialUsed',coalesce(b.trial_used,false),
    'appsumo',EXISTS(SELECT 1 FROM public.appsumo_codes WHERE redeemed_by_user_id=p_owner),
    'resetAt',(SELECT w.window_end FROM public.cloud_usage_window(b.period_start,b.period_end) w),'usage',jsonb_build_object('projects',v_projects,'internal_users',v_users,
    'comments',public.cloud_usage_count(p_owner,'comments'),'product_audits',public.cloud_usage_count(p_owner,'product_audits')),
    'limits',jsonb_build_object('projects',public.cloud_limit(p_owner,'projects'),
    'internal_users',public.cloud_limit(p_owner,'internal_users'),'comments',public.cloud_limit(p_owner,'comments'),
    'product_audits',public.cloud_limit(p_owner,'product_audits')));
END;
$$;
--> statement-breakpoint
NOTIFY pgrst, 'reload schema';
