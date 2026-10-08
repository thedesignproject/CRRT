CREATE OR REPLACE FUNCTION public.agent_collaborator_identity_key(p_user uuid, p_email text)
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT CASE
    WHEN p_user IS NOT NULL THEN 'u:' || p_user::text
    WHEN resolved.id IS NOT NULL THEN 'u:' || resolved.id::text
    WHEN nullif(lower(trim(p_email)), '') IS NOT NULL THEN 'e:' || lower(trim(p_email))
  END
  FROM (SELECT 1) seed
  LEFT JOIN LATERAL (
    SELECT u.id FROM auth.users u
    WHERE p_user IS NULL AND lower(u.email) = lower(trim(p_email))
    ORDER BY u.id LIMIT 1
  ) resolved ON true;
$$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION public.agent_collaborator_usage(p_owner uuid)
RETURNS integer LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  WITH owned_projects AS (
    SELECT m.project_key FROM public.project_members m
    WHERE m.user_id = p_owner AND m.is_owner
  ), identities AS (
    SELECT public.agent_collaborator_identity_key(m.user_id, null) AS identity_key
    FROM owned_projects p JOIN public.project_members m ON m.project_key = p.project_key
    WHERE NOT m.is_owner AND m.role IN ('admin', 'member')
    UNION
    SELECT public.agent_collaborator_identity_key(null, i.email)
    FROM owned_projects p JOIN public.project_invites i ON i.project_key = p.project_key
    WHERE i.role IN ('admin', 'member')
  )
  SELECT count(*)::integer FROM identities WHERE identity_key IS NOT NULL
    AND identity_key <> 'u:' || p_owner::text;
$$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION public.agent_collaborator_identity_counted(p_owner uuid, p_user uuid, p_email text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  WITH wanted AS (
    SELECT public.agent_collaborator_identity_key(p_user, p_email) AS identity_key
  ), owned_projects AS (
    SELECT m.project_key FROM public.project_members m
    WHERE m.user_id = p_owner AND m.is_owner
  ), identities AS (
    SELECT public.agent_collaborator_identity_key(m.user_id, null) AS identity_key
    FROM owned_projects p JOIN public.project_members m ON m.project_key = p.project_key
    WHERE NOT m.is_owner AND m.role IN ('admin', 'member')
    UNION
    SELECT public.agent_collaborator_identity_key(null, i.email)
    FROM owned_projects p JOIN public.project_invites i ON i.project_key = p.project_key
    WHERE i.role IN ('admin', 'member')
  )
  SELECT EXISTS (
    SELECT 1 FROM wanted w JOIN identities i ON i.identity_key = w.identity_key
    WHERE w.identity_key IS NOT NULL AND w.identity_key <> 'u:' || p_owner::text
  );
$$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION public.agent_collaborator_has_seat(p_owner uuid, p_actor uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT p_actor = p_owner OR (
    public.agent_collaborator_usage(p_owner) <= 5
    AND EXISTS (
      SELECT 1 FROM public.project_members owned
      JOIN public.project_members actor ON actor.project_key = owned.project_key
      WHERE owned.user_id = p_owner AND owned.is_owner
        AND actor.user_id = p_actor AND NOT actor.is_owner
        AND actor.role IN ('admin', 'member')
    )
  );
$$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION public.enforce_agent_invite_seat()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_owner uuid;
  v_user uuid;
BEGIN
  PERFORM 1 FROM public.projects p WHERE p.public_key = NEW.project_key FOR SHARE;
  SELECT m.user_id INTO v_owner FROM public.project_members m
    WHERE m.project_key = NEW.project_key AND m.is_owner;
  IF v_owner IS NULL THEN RAISE EXCEPTION 'project_owner_missing'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('crrt-agent-seats:' || v_owner::text, 0));
  IF NEW.role = 'guest' THEN RETURN NEW; END IF;
  SELECT u.id INTO v_user FROM auth.users u WHERE lower(u.email) = lower(NEW.email) ORDER BY u.id LIMIT 1;
  IF v_user = v_owner OR public.agent_collaborator_identity_counted(v_owner, v_user, NEW.email) THEN RETURN NEW; END IF;
  IF public.agent_collaborator_usage(v_owner) >= 5 THEN RAISE EXCEPTION 'agent_seat_limit_reached'; END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint

DROP TRIGGER IF EXISTS zz_enforce_agent_invite_seat ON public.project_invites;
--> statement-breakpoint
CREATE TRIGGER zz_enforce_agent_invite_seat
BEFORE INSERT OR UPDATE OF project_key, email, role ON public.project_invites
FOR EACH ROW EXECUTE FUNCTION public.enforce_agent_invite_seat();
--> statement-breakpoint
CREATE OR REPLACE FUNCTION public.enforce_agent_member_seat()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_owner uuid;
BEGIN
  IF TG_OP = 'INSERT' THEN
    PERFORM 1 FROM public.projects p WHERE p.public_key = NEW.project_key FOR SHARE;
  END IF;
  IF TG_OP = 'DELETE' THEN
    SELECT m.user_id INTO v_owner FROM public.project_members m
      WHERE m.project_key = OLD.project_key AND m.is_owner;
  ELSE
    SELECT m.user_id INTO v_owner FROM public.project_members m
      WHERE m.project_key = NEW.project_key AND m.is_owner;
  END IF;
  IF v_owner IS NULL THEN
    IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
    IF TG_OP = 'INSERT' AND NEW.is_owner THEN RETURN NEW; END IF;
    -- The ownership RPC clears the previous owner before promoting the target.
    IF TG_OP = 'UPDATE' AND NEW.is_owner AND NOT OLD.is_owner
      AND NEW.role = 'admin' AND NEW.user_id = OLD.user_id
      AND NEW.project_key = OLD.project_key THEN RETURN NEW; END IF;
    RAISE EXCEPTION 'project_owner_missing';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('crrt-agent-seats:' || v_owner::text, 0));
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  IF NEW.is_owner OR NEW.role = 'guest' OR NEW.user_id = v_owner THEN RETURN NEW; END IF;
  IF public.agent_collaborator_identity_counted(v_owner, NEW.user_id, null) THEN RETURN NEW; END IF;
  IF public.agent_collaborator_usage(v_owner) >= 5 THEN RAISE EXCEPTION 'agent_seat_limit_reached'; END IF;
  RETURN NEW;
END;
$$;

--> statement-breakpoint
DROP TRIGGER IF EXISTS zz_enforce_agent_member_seat ON public.project_members;
--> statement-breakpoint
CREATE TRIGGER zz_enforce_agent_member_seat
BEFORE INSERT OR DELETE OR UPDATE OF role ON public.project_members
FOR EACH ROW EXECUTE FUNCTION public.enforce_agent_member_seat();
--> statement-breakpoint
CREATE OR REPLACE FUNCTION public.accept_project_invite_with_seat(p_user uuid, p_email text, p_project text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_invite public.project_invites%ROWTYPE;
BEGIN
  SELECT i.* INTO v_invite FROM public.project_invites i
    WHERE i.project_key = p_project AND i.email = lower(trim(p_email)) FOR UPDATE;
  IF NOT FOUND THEN
    IF EXISTS (SELECT 1 FROM public.project_members m WHERE m.project_key = p_project AND m.user_id = p_user) THEN
      RETURN null;
    END IF;
    RAISE EXCEPTION 'not_found';
  END IF;
  DELETE FROM public.project_invites i WHERE i.project_key = v_invite.project_key AND i.email = v_invite.email;
  INSERT INTO public.project_members(project_key, user_id, role)
    VALUES(v_invite.project_key, p_user, v_invite.role) ON CONFLICT DO NOTHING;
  RETURN v_invite.invited_by;
END;
$$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION public.create_widget_agent_share(
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
  IF cardinality(v_ids) IS NULL OR cardinality(v_ids) <> cardinality(p_comments) THEN RAISE EXCEPTION 'invalid_selection'; END IF;

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
  INSERT INTO public.feedback_share_items(share_id,comment_id) SELECT v_share.id,unnest(v_ids);
  INSERT INTO public.feedback_events(share_id,actor_type,actor_id,event_type,payload)
    VALUES(v_share.id,'reviewer',p_actor::text,'share.created',
      jsonb_build_object('scopeType','selection','commentCount',cardinality(v_ids),'source','widget'));
  RETURN NEXT v_share;
END;
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION public.agent_collaborator_identity_key(uuid,text), public.agent_collaborator_usage(uuid),
  public.agent_collaborator_identity_counted(uuid,uuid,text), public.agent_collaborator_has_seat(uuid,uuid),
  public.accept_project_invite_with_seat(uuid,text,text) FROM PUBLIC,anon,authenticated;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.agent_collaborator_has_seat(uuid,uuid),
  public.accept_project_invite_with_seat(uuid,text,text) TO service_role;
--> statement-breakpoint
REVOKE ALL ON FUNCTION public.enforce_agent_invite_seat(), public.enforce_agent_member_seat() FROM PUBLIC,anon,authenticated;
--> statement-breakpoint
NOTIFY pgrst, 'reload schema';

--> statement-breakpoint

CREATE OR REPLACE FUNCTION public.change_project_member_role(
  p_project_key text, p_actor_user_id uuid, p_target_user_id uuid, p_role text
)
RETURNS jsonb LANGUAGE plpgsql SET search_path = '' AS $$
DECLARE
  v_owner uuid;
  v_sponsor uuid;
  v_result jsonb;
BEGIN
  PERFORM 1 FROM public.projects p WHERE p.public_key = p_project_key FOR UPDATE;
  IF p_role = 'owner' THEN
    SELECT m.user_id INTO v_owner FROM public.project_members m
      WHERE m.project_key = p_project_key AND m.is_owner;
    FOR v_sponsor IN
      SELECT DISTINCT sponsor FROM unnest(ARRAY[v_owner, p_target_user_id]) sponsors(sponsor)
      WHERE sponsor IS NOT NULL ORDER BY sponsor
    LOOP
      PERFORM pg_advisory_xact_lock(hashtextextended('crrt-agent-seats:' || v_sponsor::text, 0));
    END LOOP;
  END IF;
  v_result := public.change_project_member_role_unfenced(p_project_key, p_actor_user_id, p_target_user_id, p_role);
  IF p_role = 'owner' AND v_result->>'status' = 'updated'
    AND public.agent_collaborator_usage(p_target_user_id) > 5 THEN
    RAISE EXCEPTION 'agent_seat_limit_reached';
  END IF;
  RETURN v_result;
END;
$$;
