ALTER TABLE "billing_accounts" ADD COLUMN "is_legacy" boolean DEFAULT false NOT NULL;
--> statement-breakpoint
-- Backfilled placeholders must not prevent deleting a previously unbilled user.
-- Preserve Stripe history and fence in-flight billing operations with the lease.
CREATE FUNCTION public.delete_unbilled_legacy_account() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  DELETE FROM public.billing_accounts WHERE user_id=OLD.id AND is_legacy
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
CREATE TRIGGER delete_unbilled_legacy_account BEFORE DELETE ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.delete_unbilled_legacy_account();
--> statement-breakpoint
REVOKE ALL ON FUNCTION public.delete_unbilled_legacy_account() FROM PUBLIC,anon,authenticated;
--> statement-breakpoint
INSERT INTO public.billing_accounts(user_id,is_legacy)
  SELECT id,true FROM auth.users
  ON CONFLICT (user_id) DO UPDATE SET is_legacy=true;
--> statement-breakpoint
CREATE FUNCTION public.cloud_effective_account(p_owner uuid) RETURNS SETOF public.billing_accounts
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE b public.billing_accounts%ROWTYPE;
BEGIN
  SELECT * INTO b FROM public.billing_accounts WHERE user_id=p_owner;
  IF NOT FOUND THEN RETURN; END IF;
  IF b.is_legacy AND NOT coalesce(
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
REVOKE ALL ON FUNCTION public.cloud_effective_account(uuid) FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION public.cloud_limit(p_owner uuid, p_resource text) RETURNS integer
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT CASE p_resource
    WHEN 'projects' THEN CASE WHEN plan='studio' THEN 50 ELSE 10 END
    WHEN 'internal_users' THEN CASE WHEN plan='studio' THEN 25 ELSE 10 END
    WHEN 'comments' THEN CASE WHEN plan='studio' THEN 10000 ELSE 2000 END
    WHEN 'product_audits' THEN CASE WHEN plan='studio' THEN 30 ELSE 5 END
  END FROM public.cloud_effective_account(p_owner);
$$;

--> statement-breakpoint

CREATE OR REPLACE FUNCTION public.cloud_usage_count(p_owner uuid, p_resource text) RETURNS integer
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT count(*)::integer FROM public.cloud_usage u JOIN public.cloud_effective_account(p_owner) b ON b.user_id=u.owner_id
    WHERE u.owner_id=p_owner AND u.resource=p_resource AND NOT u.released AND u.window_start=b.period_start;
$$;

--> statement-breakpoint

CREATE OR REPLACE FUNCTION public.cloud_fail(p_owner uuid, p_resource text, p_used integer DEFAULT 0) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_detail text;
BEGIN
  v_detail:=jsonb_build_object(
    'code','plan_limit','resource',p_resource,'usage',p_used,'limit',public.cloud_limit(p_owner,p_resource),
    'resetAt',CASE WHEN p_resource IN ('comments','product_audits') THEN
      (SELECT period_end FROM public.cloud_effective_account(p_owner)) END,
    'action',CASE WHEN p_resource='subscription' THEN 'manage_billing' ELSE 'upgrade_or_wait' END)::text;
  RAISE EXCEPTION USING MESSAGE='cloud_plan_limit:' || v_detail, DETAIL=v_detail;
END;
$$;

--> statement-breakpoint

CREATE OR REPLACE FUNCTION public.cloud_validate_write(p_owner uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE b public.billing_accounts%ROWTYPE;
BEGIN
  IF NOT public.cloud_enabled() THEN RETURN; END IF;
  IF p_owner IS NULL THEN PERFORM public.cloud_fail(p_owner,'subscription'); END IF;
  PERFORM 1 FROM public.billing_accounts WHERE user_id=p_owner FOR SHARE;
  SELECT * INTO b FROM public.cloud_effective_account(p_owner);
  IF b.plan IS NULL OR b.plan NOT IN ('pro','studio') OR b.period_start IS NULL OR b.period_start>now()
    OR b.period_end IS NULL OR b.period_end<=now()
    OR NOT coalesce((b.subscription_status IN ('active','trialing','legacy')
      OR (b.subscription_status='past_due' AND b.grace_until>now())),false) THEN
    PERFORM public.cloud_fail(p_owner,'subscription');
  END IF;
END;
$$;

--> statement-breakpoint

CREATE OR REPLACE FUNCTION public.cloud_charge(p_owner uuid,p_resource text,p_id uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF NOT public.cloud_enabled() THEN RETURN; END IF;
  PERFORM public.cloud_require_write(p_owner);
  IF EXISTS(SELECT 1 FROM public.cloud_usage WHERE resource=p_resource AND resource_id=p_id) THEN RETURN; END IF;
  PERFORM public.cloud_check_capacity(p_owner,p_resource,1);
  INSERT INTO public.cloud_usage(resource_id,resource,owner_id,window_start,window_end)
    SELECT p_id,p_resource,user_id,period_start,period_end FROM public.cloud_effective_account(p_owner);
END;
$$;

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
    'resetAt',b.period_end,'usage',jsonb_build_object('projects',v_projects,'internal_users',v_users,
    'comments',public.cloud_usage_count(p_owner,'comments'),'product_audits',public.cloud_usage_count(p_owner,'product_audits')),
    'limits',jsonb_build_object('projects',public.cloud_limit(p_owner,'projects'),
    'internal_users',public.cloud_limit(p_owner,'internal_users'),'comments',public.cloud_limit(p_owner,'comments'),
    'product_audits',public.cloud_limit(p_owner,'product_audits')));
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
    IF NOT coalesce(v_billing.is_legacy,false) AND NOT coalesce(
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
REVOKE ALL ON FUNCTION public.read_approved_widget_comment(text,uuid,uuid,text), public.begin_approved_widget_tracker_dispatch(text,uuid,uuid,uuid,uuid), public.create_approved_widget_agent_share(text,uuid,text,text,text,text[],jsonb,uuid[]) FROM PUBLIC,anon,authenticated;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.read_approved_widget_comment(text,uuid,uuid,text), public.begin_approved_widget_tracker_dispatch(text,uuid,uuid,uuid,uuid), public.create_approved_widget_agent_share(text,uuid,text,text,text,text[],jsonb,uuid[]) TO service_role;
--> statement-breakpoint
NOTIFY pgrst, 'reload schema';

--> statement-breakpoint
NOTIFY pgrst,'reload schema';
