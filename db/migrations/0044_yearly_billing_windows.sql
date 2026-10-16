CREATE FUNCTION public.cloud_usage_window(p_start timestamptz,p_end timestamptz,p_now timestamptz DEFAULT now())
RETURNS TABLE(window_start timestamptz,window_end timestamptz)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' SET timezone = 'UTC' AS $$
DECLARE v_months integer; v_start timestamptz;
BEGIN
  IF p_start IS NULL OR p_end IS NULL OR p_now<p_start OR p_now>=p_end THEN RETURN; END IF;
  -- The supported single-month periods (including clipped month ends and DST)
  -- and 14-day trials fit within 32 days. Preserve their trusted boundaries.
  IF p_end<=p_start+interval '32 days' THEN
    RETURN QUERY SELECT p_start,p_end;
    RETURN;
  END IF;
  v_months:=(extract(year FROM p_now)::integer-extract(year FROM p_start)::integer)*12
    +extract(month FROM p_now)::integer-extract(month FROM p_start)::integer;
  v_start:=p_start+make_interval(months=>v_months);
  IF v_start>p_now THEN
    v_months:=v_months-1;
    v_start:=p_start+make_interval(months=>v_months);
  END IF;
  RETURN QUERY SELECT v_start,least(p_end,p_start+make_interval(months=>v_months+1));
END;
$$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION public.cloud_usage_count(p_owner uuid,p_resource text) RETURNS integer
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT count(*)::integer FROM public.cloud_usage u JOIN public.cloud_effective_account(p_owner) b ON b.user_id=u.owner_id
    CROSS JOIN LATERAL public.cloud_usage_window(b.period_start,b.period_end) w
    WHERE u.owner_id=p_owner AND u.resource=p_resource AND NOT u.released AND u.window_start=w.window_start;
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
    SELECT p_id,p_resource,b.user_id,w.window_start,w.window_end FROM public.cloud_effective_account(p_owner) b
      CROSS JOIN LATERAL public.cloud_usage_window(b.period_start,b.period_end) w WHERE b.user_id=p_owner;
END;
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION public.cloud_usage_window(timestamptz,timestamptz,timestamptz) FROM PUBLIC,anon,authenticated;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION public.cloud_fail(p_owner uuid, p_resource text, p_used integer DEFAULT 0) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_detail text;
BEGIN
  v_detail:=jsonb_build_object(
    'code','plan_limit','resource',p_resource,'usage',p_used,'limit',public.cloud_limit(p_owner,p_resource),
    'resetAt',CASE WHEN p_resource IN ('comments','product_audits') THEN
      (SELECT w.window_end FROM public.cloud_effective_account(p_owner) b CROSS JOIN LATERAL public.cloud_usage_window(b.period_start,b.period_end) w WHERE b.user_id=p_owner) END,
    'action',CASE WHEN p_resource='subscription' THEN 'manage_billing' ELSE 'upgrade_or_wait' END)::text;
  RAISE EXCEPTION USING MESSAGE='cloud_plan_limit:' || v_detail, DETAIL=v_detail;
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
    'resetAt',(SELECT w.window_end FROM public.cloud_usage_window(b.period_start,b.period_end) w),'usage',jsonb_build_object('projects',v_projects,'internal_users',v_users,
    'comments',public.cloud_usage_count(p_owner,'comments'),'product_audits',public.cloud_usage_count(p_owner,'product_audits')),
    'limits',jsonb_build_object('projects',public.cloud_limit(p_owner,'projects'),
    'internal_users',public.cloud_limit(p_owner,'internal_users'),'comments',public.cloud_limit(p_owner,'comments'),
    'product_audits',public.cloud_limit(p_owner,'product_audits')));
END;
$$;
--> statement-breakpoint
NOTIFY pgrst,'reload schema';
