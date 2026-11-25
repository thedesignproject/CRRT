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
ALTER TABLE "billing_accounts" ADD COLUMN "included_pro" text;--> statement-breakpoint
-- Every early user keeps Pro through the new column before its checks apply.
UPDATE "billing_accounts" SET "included_pro"='early_access' WHERE "is_legacy";--> statement-breakpoint
ALTER TABLE "appsumo_codes" ADD CONSTRAINT "appsumo_codes_redeemed_by_user_id_users_id_fk" FOREIGN KEY ("redeemed_by_user_id") REFERENCES "auth"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "appsumo_redemption_attempts" ADD CONSTRAINT "appsumo_redemption_attempts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "appsumo_codes_one_per_user" ON "appsumo_codes" USING btree ("redeemed_by_user_id") WHERE "appsumo_codes"."redeemed_by_user_id" is not null;--> statement-breakpoint
CREATE INDEX "appsumo_redemption_attempts_recent" ON "appsumo_redemption_attempts" USING btree ("user_id","created_at");--> statement-breakpoint
ALTER TABLE "billing_accounts" ADD CONSTRAINT "billing_accounts_included_pro" CHECK ("billing_accounts"."included_pro" in ('early_access','appsumo'));--> statement-breakpoint
ALTER TABLE "billing_accounts" ADD CONSTRAINT "billing_accounts_legacy_included_pro" CHECK (not "billing_accounts"."is_legacy" or "billing_accounts"."included_pro" is not null);
--> statement-breakpoint
CREATE OR REPLACE FUNCTION public.cloud_effective_account(p_owner uuid) RETURNS SETOF public.billing_accounts
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE b public.billing_accounts%ROWTYPE;
BEGIN
  SELECT * INTO b FROM public.billing_accounts WHERE user_id=p_owner;
  IF NOT FOUND THEN RETURN; END IF;
  IF b.included_pro IS NOT NULL AND NOT coalesce(
    b.plan IN ('pro','studio') AND b.period_start<=now() AND b.period_end>now()
    AND (b.subscription_status IN ('active','trialing')
      OR (b.subscription_status='past_due' AND b.grace_until>now())),false) THEN
    b.plan:='pro';
    b.subscription_status:='legacy';
    b.period_start:=date_trunc('month',now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC';
    b.period_end:=(date_trunc('month',now() AT TIME ZONE 'UTC')+interval '1 month') AT TIME ZONE 'UTC';
  END IF;
  RETURN NEXT b;
END;
$$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION public.delete_unbilled_legacy_account() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  DELETE FROM public.billing_accounts WHERE user_id=OLD.id
    AND customer_id IS NULL AND subscription_id IS NULL AND price_id IS NULL
    AND checkout_session_id IS NULL AND checkout_payload IS NULL
    AND plan IS NULL AND subscription_status IS NULL AND NOT trial_used
    AND period_start IS NULL AND period_end IS NULL AND grace_until IS NULL
    AND NOT cancel_at_period_end
    AND (lock_token IS NULL OR lock_expires_at<=clock_timestamp());
  RETURN OLD;
END;
$$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION public.create_approved_widget_agent_share(
  p_project text,
  p_actor uuid,
  p_page_url text,
  p_idempotency_key text,
  p_request_hash text,
  p_allowed_prices text[],
  p_share jsonb,
  p_comments uuid[]
)
RETURNS SETOF public.feedback_shares LANGUAGE plpgsql SET search_path = '' AS $$
DECLARE
  v_owner uuid;
  v_is_owner boolean;
  v_billing public.billing_accounts%ROWTYPE;
  v_requested uuid[];
  v_ids uuid[];
  v_share public.feedback_shares%ROWTYPE;
BEGIN
  IF p_page_url IS NULL OR p_page_url = ''
    OR p_idempotency_key !~ '^[A-Za-z0-9_-]{16,128}$'
    OR p_request_hash !~ '^[0-9a-f]{64}$'
    OR cardinality(p_comments) IS NULL OR cardinality(p_comments) < 1 OR cardinality(p_comments) > 100
    OR cardinality(p_allowed_prices) IS NULL OR cardinality(p_allowed_prices) < 1 THEN
    RAISE EXCEPTION 'invalid_widget_agent_request';
  END IF;

  SELECT array_agg(DISTINCT requested.id ORDER BY requested.id)
    INTO v_requested FROM unnest(p_comments) requested(id);
  IF cardinality(v_requested) <> cardinality(p_comments) THEN RAISE EXCEPTION 'invalid_selection'; END IF;

  PERFORM public.lock_feedback_actor(p_project,p_actor,'agent:operate');
  SELECT owner.user_id, actor.is_owner INTO v_owner, v_is_owner
    FROM public.project_members owner JOIN public.project_members actor ON actor.project_key = owner.project_key
    WHERE owner.project_key = p_project AND owner.is_owner AND actor.user_id = p_actor;
  IF v_owner IS NULL THEN RAISE EXCEPTION 'project_access_denied'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('crrt-agent-seats:' || v_owner::text, 0));
  IF NOT v_is_owner AND NOT public.agent_collaborator_has_seat(v_owner, p_actor) THEN
    RAISE EXCEPTION 'seat_limit_reached';
  END IF;


  -- Only the trusted service-role caller supplies the Community sentinel.
  -- Cloud Agent eligibility remains enforced independently of quota activation.
  IF p_allowed_prices IS DISTINCT FROM ARRAY['community']::text[] THEN
    PERFORM 1 FROM public.billing_accounts WHERE user_id=v_owner FOR SHARE;
    SELECT * INTO v_billing FROM public.cloud_effective_account(v_owner);
    IF v_billing.included_pro IS NULL AND NOT coalesce(
      v_billing.plan IN ('pro','studio') AND v_billing.price_id=ANY(p_allowed_prices)
      AND v_billing.period_start<=now() AND v_billing.period_end>now()
      AND (v_billing.subscription_status IN ('active','trialing')
        OR (v_billing.subscription_status='past_due' AND v_billing.grace_until>now())),false) THEN
      IF v_is_owner THEN RAISE EXCEPTION 'upgrade_required'; END IF;
      RAISE EXCEPTION 'owner_upgrade_required';
    END IF;
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(
    'crrt-widget-agent:' || p_project || ':' || p_actor::text || ':' || p_idempotency_key, 0
  ));
  SELECT s.* INTO v_share FROM public.feedback_shares s
    WHERE s.project_id=p_project AND s.actor_user_id=p_actor AND s.idempotency_key=p_idempotency_key FOR UPDATE;
  IF v_share.id IS NOT NULL AND v_share.request_hash IS DISTINCT FROM p_request_hash THEN
    RAISE EXCEPTION 'idempotency_conflict';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended('crrt-github-issue:' || p_project,0));
  SELECT array_agg(eligible.id ORDER BY eligible.id) INTO v_ids FROM (
    SELECT c.id FROM public.comments c
      WHERE c.id=ANY(p_comments) AND c.project_id=p_project AND c.url=p_page_url
        AND c.visibility='shared' AND c.status='approved'
        AND coalesce(c.implementation_status,'unassigned') NOT IN ('done','ready_for_testing')
      ORDER BY c.id FOR UPDATE
  ) eligible;
  IF cardinality(v_ids) IS NULL OR cardinality(v_ids) <> cardinality(p_comments) THEN RAISE EXCEPTION 'invalid_selection'; END IF;

  IF v_share.id IS NOT NULL THEN
    RETURN NEXT v_share;
    RETURN;
  END IF;
  INSERT INTO public.feedback_shares(
    project_id,scope_type,scope_page_url,slug,access_token_hash,access_token_ciphertext,
    created_by,actor_user_id,idempotency_key,request_hash,expires_at
  ) VALUES(
    p_project,'selection',p_page_url,p_share->>'slug',p_share->>'access_token_hash',
    p_share->>'access_token_ciphertext','reviewer',p_actor,p_idempotency_key,p_request_hash,
    (p_share->>'expires_at')::timestamptz
  ) RETURNING * INTO v_share;
  INSERT INTO public.feedback_share_items(share_id,comment_id) SELECT v_share.id,unnest(v_ids);
  INSERT INTO public.feedback_events(share_id,actor_type,actor_id,event_type,payload)
    VALUES(v_share.id,'reviewer',p_actor::text,'share.created',
      jsonb_build_object('scopeType','selection','commentCount',cardinality(v_ids),'source','widget'));
  RETURN NEXT v_share;
END;
$$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION public.record_charge_payload(p_actor uuid,p_id uuid,p_key uuid,p_limit integer,p_revision integer,p_project text,p_prices text[] DEFAULT NULL) RETURNS void
LANGUAGE plpgsql SET search_path='' AS $$
DECLARE r public.recordings; sponsor uuid; billing public.billing_accounts;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended(p_actor::text,5959));
  SELECT * INTO r FROM public.recordings WHERE id=p_id AND owner_id=p_actor AND deleted_at IS NULL FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'record_not_found'; END IF;
  IF r.revision IS DISTINCT FROM p_revision OR r.project_key IS DISTINCT FROM p_project THEN RAISE EXCEPTION 'record_conflict'; END IF;
  sponsor:=p_actor;
  IF r.project_key IS NOT NULL THEN
    PERFORM public.lock_feedback_actor(r.project_key,p_actor,'agent:operate');
    SELECT user_id INTO sponsor FROM public.project_members WHERE project_key=r.project_key AND is_owner FOR SHARE;
    IF sponsor IS NULL THEN RAISE EXCEPTION 'record_forbidden'; END IF;
  END IF;
  IF p_prices IS NOT NULL THEN
    SELECT * INTO billing FROM public.billing_accounts WHERE user_id=sponsor FOR SHARE;
    IF NOT FOUND OR NOT (billing.included_pro IS NOT NULL OR coalesce((billing.plan IN ('pro','studio') AND billing.price_id=ANY(p_prices)
      AND billing.period_start<=now() AND billing.period_end>now()
      AND (billing.subscription_status IN ('active','trialing') OR (billing.subscription_status='past_due' AND billing.grace_until>now()))),false)) THEN
      RAISE EXCEPTION 'record_upgrade_required';
    END IF;
  END IF;
  IF EXISTS(SELECT 1 FROM public.recording_usage WHERE recording_id=p_id AND actor_id=p_actor AND request_key=p_key AND resource='agent_payload') THEN RETURN; END IF;
  IF (SELECT count(*) FROM public.recording_usage WHERE actor_id=p_actor AND resource='agent_payload' AND created_at>=date_trunc('day',now()))>=p_limit THEN RAISE EXCEPTION 'record_quota'; END IF;
  INSERT INTO public.recording_usage(recording_id,actor_id,request_key,resource,amount) VALUES(p_id,p_actor,p_key,'agent_payload',1);
END $$;
--> statement-breakpoint
-- Serialize each user's redemptions so the per-user limit and the one-code rule
-- cannot race. The conditional UPDATE is the atomic claim: a concurrent caller
-- re-reads the committed row and finds it already redeemed.
CREATE FUNCTION public.redeem_appsumo_code(p_user uuid, p_code text)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_code text; v_now timestamptz:=clock_timestamp();
BEGIN
  IF p_user IS NULL OR p_code IS NULL OR length(p_code) NOT BETWEEN 1 AND 128 THEN RETURN 'invalid_code'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('crrt-appsumo:' || p_user::text, 0));
  IF EXISTS(SELECT 1 FROM public.appsumo_codes WHERE redeemed_by_user_id=p_user) THEN RETURN 'already_has_plan'; END IF;
  IF (SELECT count(*) FROM public.appsumo_redemption_attempts
      WHERE user_id=p_user AND created_at>v_now-interval '1 hour')>=10 THEN
    RETURN 'rate_limited';
  END IF;
  UPDATE public.appsumo_codes SET redeemed_at=v_now, redeemed_by_user_id=p_user
    WHERE code=p_code AND redeemed_at IS NULL RETURNING code INTO v_code;
  IF v_code IS NULL THEN
    INSERT INTO public.appsumo_redemption_attempts(user_id) VALUES (p_user);
    IF EXISTS(SELECT 1 FROM public.appsumo_codes WHERE code=p_code) THEN RETURN 'already_redeemed'; END IF;
    RETURN 'invalid_code';
  END IF;
  -- Lifetime outranks early access; is_legacy still records the early user.
  INSERT INTO public.billing_accounts(user_id,included_pro) VALUES (p_user,'appsumo')
    ON CONFLICT (user_id) DO UPDATE SET included_pro='appsumo', updated_at=now();
  RETURN 'redeemed';
END;
$$;
--> statement-breakpoint
-- Refunds: the code stays used (redeemed_at is kept) but no longer belongs to
-- anyone, and the account falls back to early access or to no included plan.
-- shortcut: assumes early access is still running; update this when it ends.
CREATE FUNCTION public.revoke_appsumo_code(p_code text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_user uuid;
BEGIN
  SELECT redeemed_by_user_id INTO v_user FROM public.appsumo_codes
    WHERE code=p_code AND redeemed_by_user_id IS NOT NULL FOR UPDATE;
  IF NOT FOUND THEN RETURN false; END IF;
  UPDATE public.appsumo_codes SET redeemed_by_user_id=NULL WHERE code=p_code;
  UPDATE public.billing_accounts SET included_pro=CASE WHEN is_legacy THEN 'early_access' END, updated_at=now()
    WHERE user_id=v_user AND included_pro='appsumo';
  RETURN true;
END;
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION public.redeem_appsumo_code(uuid,text), public.revoke_appsumo_code(text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.redeem_appsumo_code(uuid,text) TO service_role;
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
    'isLegacy',coalesce(b.is_legacy,false),'includedPro',b.included_pro,'plan',b.plan,'status',coalesce(b.subscription_status,'none'),'canWrite',v_writes,'trialUsed',coalesce(b.trial_used,false),
    'resetAt',(SELECT w.window_end FROM public.cloud_usage_window(b.period_start,b.period_end) w),'usage',jsonb_build_object('projects',v_projects,'internal_users',v_users,
    'comments',public.cloud_usage_count(p_owner,'comments'),'product_audits',public.cloud_usage_count(p_owner,'product_audits')),
    'limits',jsonb_build_object('projects',public.cloud_limit(p_owner,'projects'),
    'internal_users',public.cloud_limit(p_owner,'internal_users'),'comments',public.cloud_limit(p_owner,'comments'),
    'product_audits',public.cloud_limit(p_owner,'product_audits')));
END;
$$;
--> statement-breakpoint
NOTIFY pgrst, 'reload schema';
