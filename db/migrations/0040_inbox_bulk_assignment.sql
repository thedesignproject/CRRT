CREATE TABLE "extension_image_cleanup_jobs" (
	"storage_path" text PRIMARY KEY NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"next_attempt_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "extension_image_cleanup_jobs_attempts_check" CHECK ("extension_image_cleanup_jobs"."attempts" >= 0)
);
--> statement-breakpoint
ALTER TABLE "extension_image_cleanup_jobs" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE INDEX "extension_image_cleanup_jobs_due_idx" ON "extension_image_cleanup_jobs" USING btree ("next_attempt_at","storage_path");
--> statement-breakpoint
CREATE FUNCTION public.assign_actor_inbox_feedback(p_actor uuid, p_project text, p_ids uuid[], p_visibility text)
RETURNS TABLE(id uuid) LANGUAGE plpgsql SET search_path = '' AS $$
DECLARE v_role text;
BEGIN
  PERFORM 1 FROM public.projects p WHERE p.public_key=p_project FOR SHARE;
  SELECT m.role INTO v_role FROM public.project_members m WHERE m.project_key=p_project AND m.user_id=p_actor;
  -- All current members may create feedback, including guests in a private
  -- admins-only project; reading/managing existing feedback is a separate gate.
  IF v_role IS NULL THEN RAISE EXCEPTION 'forbidden'; END IF;
  IF p_visibility IS NULL OR p_visibility NOT IN ('shared','internal') THEN RAISE EXCEPTION 'invalid_visibility'; END IF;
  RETURN QUERY UPDATE public.comments c SET project_id=p_project,
    visibility=CASE WHEN v_role='guest' THEN 'shared' ELSE p_visibility END, updated_at=now()
    WHERE c.id=ANY(p_ids) AND c.source='extension' AND c.created_by_user_id=p_actor AND c.project_id IS NULL
    RETURNING c.id;
END;
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION public.assign_actor_inbox_feedback(uuid,text,uuid[],text) FROM PUBLIC, anon, authenticated;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.assign_actor_inbox_feedback(uuid,text,uuid[],text) TO service_role;
--> statement-breakpoint
NOTIFY pgrst, 'reload schema';
--> statement-breakpoint
CREATE FUNCTION public.enqueue_extension_image_cleanup()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  INSERT INTO public.extension_image_cleanup_jobs (storage_path)
  VALUES (OLD.screenshot_storage_path) ON CONFLICT (storage_path) DO NOTHING;
  RETURN OLD;
END;
$$;
REVOKE ALL ON FUNCTION public.enqueue_extension_image_cleanup() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER comments_extension_image_cleanup AFTER DELETE ON public.comments
FOR EACH ROW WHEN (OLD.source = 'extension' AND OLD.screenshot_storage_path IS NOT NULL)
EXECUTE FUNCTION public.enqueue_extension_image_cleanup();
--> statement-breakpoint
CREATE FUNCTION public.read_approved_widget_comment(p_project text, p_actor uuid, p_comment uuid, p_capability text)
RETURNS SETOF public.comments LANGUAGE plpgsql SET search_path = '' AS $$
DECLARE v_role text;
BEGIN
  v_role := public.lock_feedback_actor(p_project,p_actor,p_capability);
  RETURN QUERY SELECT c.* FROM public.comments c WHERE c.id=p_comment AND c.project_id=p_project
    AND c.visibility='shared' AND c.status='approved' FOR SHARE;
END;
$$;
--> statement-breakpoint
CREATE FUNCTION public.begin_approved_widget_tracker_dispatch(p_project text,p_actor uuid,p_comment uuid,p_lease uuid,p_work uuid DEFAULT NULL)
RETURNS boolean LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  PERFORM public.lock_feedback_actor(p_project,p_actor,'integrations:send');
  PERFORM pg_advisory_xact_lock(hashtextextended('crrt-github-issue:' || p_project,0));
  PERFORM 1 FROM public.comments c WHERE c.id=p_comment AND c.project_id=p_project AND c.status='approved' AND c.visibility='shared' FOR UPDATE;
  IF NOT FOUND THEN RETURN false; END IF;
  IF p_work IS NULL THEN
    IF NOT public.mark_comment_github_issue_uncertain(p_comment,p_project,p_lease) THEN RETURN false; END IF;
    UPDATE public.comments SET github_issue_lease_expires_at='infinity'::timestamptz
      WHERE id=p_comment AND project_id=p_project AND github_issue_lease_token=p_lease;
    RETURN true;
  END IF;
  UPDATE public.comment_external_work w SET uncertain_at=now(),lease_expires_at='infinity'::timestamptz,updated_at=now()
    WHERE w.id=p_work AND w.comment_id=p_comment AND w.project_id=p_project AND w.state='creating'
      AND w.lease_token=p_lease AND w.uncertain_at IS NULL AND w.lease_expires_at>clock_timestamp();
  RETURN FOUND;
END;
$$;
--> statement-breakpoint
CREATE FUNCTION public.create_approved_widget_agent_share(
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
  v_status text;
  v_price text;
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

  SELECT b.subscription_status,b.price_id INTO v_status,v_price
    FROM public.billing_accounts b WHERE b.user_id=v_owner FOR SHARE;
  IF v_status IS NULL OR v_status NOT IN ('active','trialing') OR v_price IS NULL OR NOT (v_price=ANY(p_allowed_prices)) THEN
    IF v_is_owner THEN RAISE EXCEPTION 'upgrade_required'; END IF;
    RAISE EXCEPTION 'owner_upgrade_required';
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
