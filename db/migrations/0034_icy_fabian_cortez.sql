ALTER TABLE "feedback_shares" ADD COLUMN "actor_user_id" uuid;--> statement-breakpoint
ALTER TABLE "feedback_shares" ADD COLUMN "idempotency_key" text;--> statement-breakpoint
ALTER TABLE "feedback_shares" ADD COLUMN "request_hash" text;--> statement-breakpoint
ALTER TABLE "feedback_shares" ADD CONSTRAINT "feedback_shares_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "auth"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "feedback_shares_widget_idempotency_unique" ON "feedback_shares" USING btree ("project_id","actor_user_id","idempotency_key") WHERE "feedback_shares"."actor_user_id" is not null and "feedback_shares"."idempotency_key" is not null;--> statement-breakpoint
ALTER TABLE "feedback_shares" ADD CONSTRAINT "feedback_shares_widget_idempotency_shape_check" CHECK (("feedback_shares"."actor_user_id" is null and "feedback_shares"."idempotency_key" is null and "feedback_shares"."request_hash" is null)
        or ("feedback_shares"."actor_user_id" is not null and "feedback_shares"."idempotency_key" is not null and "feedback_shares"."request_hash" is not null
          and "feedback_shares"."idempotency_key" ~ '^[A-Za-z0-9_-]{16,128}$'
          and "feedback_shares"."request_hash" ~ '^[0-9a-f]{64}$'));
--> statement-breakpoint
CREATE FUNCTION public.create_widget_agent_share(
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
  IF cardinality(v_requested) <> cardinality(p_comments) THEN
    RAISE EXCEPTION 'invalid_selection';
  END IF;

  -- Keep the lock order aligned with every membership-sensitive mutation.
  PERFORM public.lock_feedback_actor(p_project,p_actor,'agent:operate');
  SELECT m.is_owner INTO v_is_owner FROM public.project_members m
    WHERE m.project_key=p_project AND m.user_id=p_actor;
  IF v_is_owner IS DISTINCT FROM true THEN RAISE EXCEPTION 'seat_limit_reached'; END IF;

  SELECT b.subscription_status,b.price_id INTO v_status,v_price
    FROM public.billing_accounts b WHERE b.user_id=p_actor FOR SHARE;
  IF v_status IS NULL OR v_status NOT IN ('active','trialing') OR v_price IS NULL OR NOT (v_price=ANY(p_allowed_prices)) THEN
    RAISE EXCEPTION 'upgrade_required';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(
    'crrt-widget-agent:' || p_project || ':' || p_actor::text || ':' || p_idempotency_key, 0
  ));
  SELECT s.* INTO v_share FROM public.feedback_shares s
    WHERE s.project_id=p_project AND s.actor_user_id=p_actor AND s.idempotency_key=p_idempotency_key
    FOR UPDATE;
  IF v_share.id IS NOT NULL THEN
    IF v_share.request_hash IS DISTINCT FROM p_request_hash THEN RAISE EXCEPTION 'idempotency_conflict'; END IF;
    RETURN NEXT v_share;
    RETURN;
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended('crrt-github-issue:' || p_project,0));
  SELECT array_agg(eligible.id ORDER BY eligible.id) INTO v_ids FROM (
    SELECT c.id FROM public.comments c
      WHERE c.id=ANY(p_comments) AND c.project_id=p_project AND c.url=p_page_url
        AND c.visibility='shared' AND c.status IN ('pending','approved')
        AND coalesce(c.implementation_status,'unassigned') NOT IN ('done','ready_for_testing')
      ORDER BY c.id FOR UPDATE
  ) eligible;
  IF cardinality(v_ids) IS NULL OR cardinality(v_ids) <> cardinality(p_comments) THEN
    RAISE EXCEPTION 'invalid_selection';
  END IF;

  UPDATE public.comments c SET status='approved',updated_at=now()
    WHERE c.id=ANY(v_ids) AND c.project_id=p_project AND c.status='pending';
  INSERT INTO public.feedback_shares(
    project_id,scope_type,scope_page_url,slug,access_token_hash,access_token_ciphertext,
    created_by,actor_user_id,idempotency_key,request_hash,expires_at
  ) VALUES(
    p_project,'selection',p_page_url,p_share->>'slug',p_share->>'access_token_hash',
    p_share->>'access_token_ciphertext','reviewer',p_actor,p_idempotency_key,p_request_hash,
    (p_share->>'expires_at')::timestamptz
  ) RETURNING * INTO v_share;
  INSERT INTO public.feedback_share_items(share_id,comment_id)
    SELECT v_share.id,unnest(v_ids);
  INSERT INTO public.feedback_events(share_id,actor_type,actor_id,event_type,payload)
    VALUES(v_share.id,'reviewer',p_actor::text,'share.created',
      jsonb_build_object('scopeType','selection','commentCount',cardinality(v_ids),'source','widget'));
  RETURN NEXT v_share;
END;
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION public.create_widget_agent_share(text,uuid,text,text,text,text[],jsonb,uuid[])
  FROM PUBLIC,anon,authenticated;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.create_widget_agent_share(text,uuid,text,text,text,text[],jsonb,uuid[])
  TO service_role;
