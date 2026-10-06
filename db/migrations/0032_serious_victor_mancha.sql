ALTER TABLE "projects" ADD CONSTRAINT "projects_feedback_access_check" CHECK ("projects"."feedback_access" in ('team', 'admins'));
--> statement-breakpoint

CREATE OR REPLACE FUNCTION public.project_feedback_allowed(p_project text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.projects p JOIN public.project_members m ON m.project_key = p.public_key
    WHERE p.public_key = p_project AND m.user_id = auth.uid()
      AND (NOT p.widget_private OR p.feedback_access = 'team'
        OR (p.feedback_access = 'admins' AND (m.role = 'admin' OR m.is_owner)))
  );
$$;
--> statement-breakpoint
-- Project-first locking matches email claims and privacy commits. Preserve the
-- existing RPC authorization/owner protections behind service-only wrappers.
ALTER FUNCTION public.change_project_member_role(text, uuid, uuid, text) RENAME TO change_project_member_role_unfenced;
--> statement-breakpoint
ALTER FUNCTION public.remove_project_member(text, uuid, uuid) RENAME TO remove_project_member_unfenced;
--> statement-breakpoint
CREATE FUNCTION public.change_project_member_role(p_project_key text, p_actor_user_id uuid, p_target_user_id uuid, p_role text)
RETURNS jsonb LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  PERFORM 1 FROM public.projects p WHERE p.public_key = p_project_key FOR UPDATE;
  RETURN public.change_project_member_role_unfenced(p_project_key, p_actor_user_id, p_target_user_id, p_role);
END;
$$;
--> statement-breakpoint
CREATE FUNCTION public.remove_project_member(p_project_key text, p_actor_user_id uuid, p_target_user_id uuid)
RETURNS text LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  PERFORM 1 FROM public.projects p WHERE p.public_key = p_project_key FOR UPDATE;
  RETURN public.remove_project_member_unfenced(p_project_key, p_actor_user_id, p_target_user_id);
END;
$$;
--> statement-breakpoint
CREATE FUNCTION public.fence_project_member_delivery()
RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  -- A direct/cascade write already holds a member row. Never wait here for a
  -- project held by a member-management RPC: that RPC may need this same row.
  BEGIN
    PERFORM 1 FROM public.projects p WHERE p.public_key = OLD.project_key FOR UPDATE NOWAIT;
  EXCEPTION WHEN lock_not_available THEN
    RAISE EXCEPTION 'project_membership_busy' USING ERRCODE = '55P03';
  END;
  IF public.tracker_dispatch_pending(OLD.project_key) THEN RAISE EXCEPTION 'tracker_dispatch_in_progress'; END IF;
  IF EXISTS (SELECT 1 FROM public.comment_email_batches b JOIN public.comments c ON c.id = b.delivery_id
    WHERE c.project_id = OLD.project_key AND b.status = 'pending' AND b.lease_token IS NOT NULL
  ) THEN RAISE EXCEPTION 'feedback_delivery_in_progress'; END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER fence_project_member_delivery BEFORE DELETE OR UPDATE OF role, is_owner, user_id, project_key ON public.project_members
FOR EACH ROW EXECUTE FUNCTION public.fence_project_member_delivery();
--> statement-breakpoint
CREATE FUNCTION public.update_project_settings(p_project text, p_actor uuid, p_patch jsonb)
RETURNS SETOF public.projects LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  PERFORM 1 FROM public.projects p WHERE p.public_key = p_project FOR UPDATE;
  IF NOT FOUND THEN RETURN; END IF;
  PERFORM 1 FROM public.project_members m WHERE m.project_key = p_project AND m.user_id = p_actor AND m.role = 'admin';
  IF NOT FOUND THEN RAISE EXCEPTION 'forbidden'; END IF;
  RETURN QUERY UPDATE public.projects p SET
    name = CASE WHEN p_patch ? 'name' THEN p_patch->>'name' ELSE p.name END,
    allowed_origins = CASE WHEN p_patch ? 'allowed_origins' THEN ARRAY(SELECT jsonb_array_elements_text(p_patch->'allowed_origins')) ELSE p.allowed_origins END,
    widget_private = CASE WHEN p_patch ? 'widget_private' THEN (p_patch->>'widget_private')::boolean ELSE p.widget_private END,
    feedback_access = CASE WHEN p_patch ? 'feedback_access' THEN p_patch->>'feedback_access' ELSE p.feedback_access END,
    updated_at = now()
    WHERE p.public_key = p_project RETURNING p.*;
END;
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION public.change_project_member_role(text, uuid, uuid, text), public.remove_project_member(text, uuid, uuid),
  public.change_project_member_role_unfenced(text, uuid, uuid, text), public.remove_project_member_unfenced(text, uuid, uuid),
  public.update_project_settings(text, uuid, jsonb) FROM PUBLIC, anon, authenticated;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.change_project_member_role(text, uuid, uuid, text), public.remove_project_member(text, uuid, uuid),
  public.change_project_member_role_unfenced(text, uuid, uuid, text), public.remove_project_member_unfenced(text, uuid, uuid),
  public.update_project_settings(text, uuid, jsonb) TO service_role;

--> statement-breakpoint

CREATE FUNCTION public.read_project_feedback(p_project text, p_actor uuid)
RETURNS SETOF public.comments LANGUAGE plpgsql SET search_path = '' AS $$
DECLARE v_private boolean; v_access text; v_role text; v_owner boolean;
BEGIN
  SELECT p.widget_private, p.feedback_access INTO v_private, v_access FROM public.projects p WHERE p.public_key=p_project FOR SHARE;
  SELECT m.role, m.is_owner INTO v_role, v_owner FROM public.project_members m WHERE m.project_key=p_project AND m.user_id=p_actor;
  IF v_role IS NULL OR (v_private AND NOT (v_access='team' OR (v_access='admins' AND (v_role='admin' OR v_owner)))) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  RETURN QUERY SELECT c.* FROM public.comments c WHERE c.project_id=p_project AND (v_role <> 'guest' OR c.visibility='shared');
END;
$$;
--> statement-breakpoint
CREATE FUNCTION public.lock_agent_share(p_share uuid, p_token_hash text)
RETURNS public.feedback_shares LANGUAGE plpgsql SET search_path = '' AS $$
DECLARE v_share public.feedback_shares%ROWTYPE; v_project text; v_private boolean;
BEGIN
  SELECT s.project_id INTO v_project FROM public.feedback_shares s WHERE s.id=p_share;
  SELECT p.widget_private INTO v_private FROM public.projects p WHERE p.public_key=v_project FOR SHARE;
  SELECT s.* INTO v_share FROM public.feedback_shares s WHERE s.id=p_share FOR SHARE;
  IF NOT FOUND OR p_token_hash IS NULL OR v_share.access_token_hash IS DISTINCT FROM p_token_hash
    OR v_share.revoked_at IS NOT NULL OR v_share.expires_at <= clock_timestamp()
    OR (v_share.created_by='system' AND v_private) THEN RAISE EXCEPTION 'share_unavailable'; END IF;
  RETURN v_share;
END;
$$;
--> statement-breakpoint
CREATE FUNCTION public.read_share_feedback(p_share uuid, p_token_hash text DEFAULT NULL)
RETURNS SETOF public.comments LANGUAGE plpgsql SET search_path = '' AS $$
DECLARE v_share public.feedback_shares%ROWTYPE;
BEGIN
  v_share := public.lock_agent_share(p_share,p_token_hash);
  RETURN QUERY SELECT c.* FROM public.comments c WHERE c.project_id=v_share.project_id AND c.visibility='shared' AND c.status='approved'
    AND (v_share.scope_type='project' OR EXISTS (SELECT 1 FROM public.feedback_share_items i WHERE i.share_id=p_share AND i.comment_id=c.id));
END;
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION public.read_project_feedback(text, uuid), public.read_share_feedback(uuid,text), public.lock_agent_share(uuid,text) FROM PUBLIC, anon, authenticated;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.read_project_feedback(text, uuid), public.read_share_feedback(uuid,text), public.lock_agent_share(uuid,text) TO service_role;

--> statement-breakpoint

ALTER FUNCTION public.apply_agent_feedback_operation(uuid, uuid, text, text, text, text, jsonb, text) RENAME TO apply_agent_feedback_operation_unchecked;
--> statement-breakpoint
CREATE FUNCTION public.apply_agent_feedback_operation(p_share_id uuid, p_comment_id uuid, p_agent_id text, p_idempotency_key text,
  p_operation text, p_event_type text, p_payload jsonb, p_implementation_status text, p_token_hash text DEFAULT NULL)
RETURNS TABLE(outcome text, event_id bigint, comment_row jsonb) LANGUAGE plpgsql SET search_path = '' AS $$
DECLARE v_share public.feedback_shares%ROWTYPE; v_project text;
BEGIN
  v_share := public.lock_agent_share(p_share_id,p_token_hash);
  v_project := v_share.project_id;
  PERFORM 1 FROM public.comments c WHERE c.id=p_comment_id AND c.project_id=v_project AND c.visibility='shared' AND c.status='approved'
    AND (v_share.scope_type <> 'page' OR c.url=v_share.scope_page_url) FOR UPDATE;
  IF NOT FOUND THEN RETURN QUERY SELECT 'not_found'::text,NULL::bigint,NULL::jsonb; RETURN; END IF;
  IF v_share.scope_type <> 'project' THEN
    PERFORM 1 FROM public.feedback_share_items i WHERE i.share_id=p_share_id AND i.comment_id=p_comment_id FOR SHARE;
    IF NOT FOUND THEN RETURN QUERY SELECT 'not_found'::text,NULL::bigint,NULL::jsonb; RETURN; END IF;
  END IF;
  RETURN QUERY SELECT * FROM public.apply_agent_feedback_operation_unchecked(p_share_id, p_comment_id, p_agent_id,
    p_idempotency_key, p_operation, p_event_type, p_payload, p_implementation_status);
END;
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION public.apply_agent_feedback_operation(uuid, uuid, text, text, text, text, jsonb, text, text),
 public.apply_agent_feedback_operation_unchecked(uuid, uuid, text, text, text, text, jsonb, text) FROM PUBLIC, anon, authenticated;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.apply_agent_feedback_operation(uuid, uuid, text, text, text, text, jsonb, text, text),
 public.apply_agent_feedback_operation_unchecked(uuid, uuid, text, text, text, text, jsonb, text) TO service_role;

--> statement-breakpoint

-- Membership revocations cannot commit while this project lock is held. Plain
-- membership reads avoid the inverse row->project order of direct/cascade writes.
CREATE FUNCTION public.lock_feedback_actor(p_project text, p_actor uuid, p_capability text)
RETURNS text LANGUAGE plpgsql SET search_path = '' AS $$
DECLARE v_private boolean; v_access text; v_role text;
BEGIN
  SELECT p.widget_private, p.feedback_access INTO v_private,v_access FROM public.projects p WHERE p.public_key=p_project FOR SHARE;
  SELECT m.role INTO v_role FROM public.project_members m WHERE m.project_key=p_project AND m.user_id=p_actor;
  IF v_role IS NULL OR p_capability IS NULL OR p_capability NOT IN ('feedback:read','feedback:manage','agent:operate','integrations:send')
    OR (p_capability <> 'feedback:read' AND v_role NOT IN ('admin','member'))
    OR (v_private AND NOT (v_access='team' OR (v_access='admins' AND v_role='admin'))) THEN RAISE EXCEPTION 'forbidden'; END IF;
  RETURN v_role;
END;
$$;
--> statement-breakpoint
CREATE FUNCTION public.read_actor_comment(p_project text, p_actor uuid, p_comment uuid, p_capability text)
RETURNS SETOF public.comments LANGUAGE plpgsql SET search_path = '' AS $$
DECLARE v_role text;
BEGIN
  v_role := public.lock_feedback_actor(p_project,p_actor,p_capability);
  RETURN QUERY SELECT c.* FROM public.comments c WHERE c.id=p_comment AND c.project_id=p_project
    AND (v_role <> 'guest' OR c.visibility='shared') FOR SHARE;
END;
$$;
--> statement-breakpoint
CREATE FUNCTION public.mutate_actor_feedback(p_project text, p_actor uuid, p_comment uuid, p_patch jsonb)
RETURNS SETOF public.comments LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  PERFORM public.lock_feedback_actor(p_project,p_actor,'feedback:manage');
  PERFORM pg_advisory_xact_lock(hashtextextended('crrt-github-issue:' || p_project,0));
  PERFORM 1 FROM public.comments c WHERE c.id=p_comment AND c.project_id=p_project FOR UPDATE;
  IF NOT FOUND THEN RETURN; END IF;
  IF p_patch ? 'status' THEN
    -- Preserve the existing GitHub creation/uncertainty fence.
    PERFORM * FROM public.update_comment_review_status(p_comment,p_project,p_patch->>'status');
  END IF;
  IF p_patch ? 'visibility' AND p_patch->>'visibility' NOT IN ('shared','internal') THEN RAISE EXCEPTION 'invalid_visibility'; END IF;
  RETURN QUERY UPDATE public.comments c SET
    visibility=CASE WHEN p_patch ? 'visibility' THEN p_patch->>'visibility' ELSE c.visibility END,
    implementation_status=CASE WHEN p_patch ? 'implementation_status' THEN p_patch->>'implementation_status' ELSE c.implementation_status END,
    claimed_by_agent_id=CASE WHEN p_patch ? 'claimed_by_agent_id' THEN p_patch->>'claimed_by_agent_id' ELSE c.claimed_by_agent_id END,
    updated_at=now() WHERE c.id=p_comment AND c.project_id=p_project RETURNING c.*;
END;
$$;
--> statement-breakpoint
CREATE FUNCTION public.accept_actor_comment_if_open(p_project text,p_actor uuid,p_comment uuid)
RETURNS SETOF public.comments LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  PERFORM public.lock_feedback_actor(p_project,p_actor,'integrations:send');
  PERFORM pg_advisory_xact_lock(hashtextextended('crrt-github-issue:' || p_project,0));
  RETURN QUERY UPDATE public.comments c SET status='approved',updated_at=now()
    WHERE c.id=p_comment AND c.project_id=p_project AND c.status='pending' RETURNING c.*;
END;
$$;
--> statement-breakpoint
CREATE FUNCTION public.create_actor_share(p_project text, p_actor uuid, p_share jsonb, p_comments uuid[])
RETURNS SETOF public.feedback_shares LANGUAGE plpgsql SET search_path = '' AS $$
DECLARE v_ids uuid[]; v_share public.feedback_shares%ROWTYPE;
BEGIN
  PERFORM public.lock_feedback_actor(p_project,p_actor,'agent:operate');
  IF p_share->>'scope_type' NOT IN ('page','selection') OR (p_share->>'scope_type'='page' AND nullif(p_share->>'scope_page_url','') IS NULL) THEN RAISE EXCEPTION 'invalid_share_scope'; END IF;
  SELECT array_agg(eligible.id) INTO v_ids FROM (
    SELECT c.id FROM public.comments c WHERE c.id=ANY(p_comments) AND c.project_id=p_project AND c.visibility='shared' AND c.status='approved'
      AND (p_share->>'scope_type' <> 'page' OR c.url=p_share->>'scope_page_url') ORDER BY c.id FOR SHARE
  ) eligible;
  IF cardinality(v_ids) IS NULL OR cardinality(v_ids) <> cardinality(p_comments) THEN RAISE EXCEPTION 'share_comments_changed'; END IF;
  INSERT INTO public.feedback_shares(project_id,scope_type,scope_page_url,slug,access_token_hash,access_token_ciphertext,created_by,expires_at)
    VALUES(p_project,p_share->>'scope_type',p_share->>'scope_page_url',p_share->>'slug',p_share->>'access_token_hash',p_share->>'access_token_ciphertext','reviewer',(p_share->>'expires_at')::timestamptz)
    RETURNING * INTO v_share;
  INSERT INTO public.feedback_share_items(share_id,comment_id) SELECT v_share.id,unnest(v_ids);
  INSERT INTO public.feedback_events(share_id,actor_type,actor_id,event_type,payload)
    VALUES(v_share.id,'reviewer',p_actor::text,'share.created',jsonb_build_object('scopeType',v_share.scope_type,'commentCount',cardinality(v_ids)));
  RETURN NEXT v_share;
END;
$$;
--> statement-breakpoint
CREATE FUNCTION public.read_actor_share(p_share uuid, p_actor uuid)
RETURNS SETOF public.feedback_shares LANGUAGE plpgsql SET search_path = '' AS $$
DECLARE v_project text;
BEGIN
  SELECT s.project_id INTO v_project FROM public.feedback_shares s WHERE s.id=p_share;
  PERFORM public.lock_feedback_actor(v_project,p_actor,'agent:operate');
  RETURN QUERY SELECT s.* FROM public.feedback_shares s WHERE s.id=p_share AND s.revoked_at IS NULL AND s.expires_at>clock_timestamp() FOR SHARE;
END;
$$;
--> statement-breakpoint
CREATE FUNCTION public.rotate_actor_share(p_share uuid,p_actor uuid,p_expected_hash text,p_expected_cipher text,p_hash text,p_cipher text)
RETURNS SETOF public.feedback_shares LANGUAGE plpgsql SET search_path = '' AS $$
DECLARE v_project text;
BEGIN
  SELECT s.project_id INTO v_project FROM public.feedback_shares s WHERE s.id=p_share;
  PERFORM public.lock_feedback_actor(v_project,p_actor,'agent:operate');
  RETURN QUERY UPDATE public.feedback_shares s SET access_token_hash=p_hash,access_token_ciphertext=p_cipher
    WHERE s.id=p_share AND s.access_token_hash=p_expected_hash AND s.access_token_ciphertext=p_expected_cipher
      AND s.revoked_at IS NULL AND s.expires_at>clock_timestamp() RETURNING s.*;
END;
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION public.lock_feedback_actor(text,uuid,text), public.read_actor_comment(text,uuid,uuid,text),
 public.accept_actor_comment_if_open(text,uuid,uuid), public.mutate_actor_feedback(text,uuid,uuid,jsonb), public.create_actor_share(text,uuid,jsonb,uuid[]), public.read_actor_share(uuid,uuid),
 public.rotate_actor_share(uuid,uuid,text,text,text,text) FROM PUBLIC, anon, authenticated;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.lock_feedback_actor(text,uuid,text), public.read_actor_comment(text,uuid,uuid,text),
 public.accept_actor_comment_if_open(text,uuid,uuid), public.mutate_actor_feedback(text,uuid,uuid,jsonb), public.create_actor_share(text,uuid,jsonb,uuid[]), public.read_actor_share(uuid,uuid),
 public.rotate_actor_share(uuid,uuid,text,text,text,text) TO service_role;

--> statement-breakpoint

CREATE FUNCTION public.read_agent_events(p_share uuid,p_token_hash text,p_after bigint,p_limit integer)
RETURNS SETOF public.feedback_events LANGUAGE plpgsql SET search_path = '' AS $$
DECLARE v_share public.feedback_shares%ROWTYPE;
BEGIN
  v_share := public.lock_agent_share(p_share,p_token_hash);
  RETURN QUERY SELECT e.* FROM public.feedback_events e WHERE e.share_id=p_share AND e.id>p_after
    AND ((e.comment_id IS NULL AND e.event_type IN ('presence.updated','share.created')) OR EXISTS(
      SELECT 1 FROM public.comments c WHERE c.id=e.comment_id AND c.project_id=v_share.project_id AND c.visibility='shared' AND c.status='approved'
        AND (v_share.scope_type <> 'page' OR c.url=v_share.scope_page_url)
        AND (v_share.scope_type='project' OR EXISTS(SELECT 1 FROM public.feedback_share_items i WHERE i.share_id=p_share AND i.comment_id=c.id))
    ))
    ORDER BY e.id LIMIT greatest(1,least(100,p_limit));
END;
$$;
--> statement-breakpoint
CREATE FUNCTION public.write_agent_presence(p_share uuid,p_token_hash text,p_agent text,p_status text,p_summary text)
RETURNS void LANGUAGE plpgsql SET search_path = '' AS $$
DECLARE v_previous public.agent_presence%ROWTYPE;
BEGIN
  PERFORM public.lock_agent_share(p_share,p_token_hash);
  -- Serialize first insert as well as updates for this share/agent.
  PERFORM pg_advisory_xact_lock(hashtextextended('crrt-presence:' || p_share::text || ':' || p_agent,0));
  SELECT a.* INTO v_previous FROM public.agent_presence a WHERE a.share_id=p_share AND a.agent_id=p_agent;
  INSERT INTO public.agent_presence(share_id,agent_id,status,summary,last_seen_at) VALUES(p_share,p_agent,p_status,p_summary,now())
    ON CONFLICT(share_id,agent_id) DO UPDATE SET status=EXCLUDED.status,summary=EXCLUDED.summary,last_seen_at=EXCLUDED.last_seen_at;
  IF v_previous.agent_id IS NULL OR v_previous.status IS DISTINCT FROM p_status OR v_previous.summary IS DISTINCT FROM p_summary THEN
    INSERT INTO public.feedback_events(share_id,actor_type,actor_id,event_type,payload)
      VALUES(p_share,'agent',p_agent,'presence.updated',jsonb_build_object('status',p_status,'summary',p_summary));
  END IF;
END;
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION public.read_agent_events(uuid,text,bigint,integer), public.write_agent_presence(uuid,text,text,text,text) FROM PUBLIC,anon,authenticated;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.read_agent_events(uuid,text,bigint,integer), public.write_agent_presence(uuid,text,text,text,text) TO service_role;

--> statement-breakpoint

CREATE FUNCTION public.tracker_dispatch_pending(p_project text)
RETURNS boolean LANGUAGE sql SET search_path = '' AS $$
  SELECT EXISTS(SELECT 1 FROM public.comments c WHERE c.project_id=p_project AND c.github_issue_number IS NULL AND c.github_issue_uncertain_at IS NOT NULL)
    OR EXISTS(SELECT 1 FROM public.comment_external_work w WHERE w.project_id=p_project AND w.state='creating' AND w.uncertain_at IS NOT NULL);
$$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION public.fence_project_privacy_delivery()
RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  IF NEW.widget_private AND (NEW.widget_private IS DISTINCT FROM OLD.widget_private OR NEW.feedback_access IS DISTINCT FROM OLD.feedback_access)
    AND public.tracker_dispatch_pending(NEW.public_key) THEN RAISE EXCEPTION 'tracker_dispatch_in_progress'; END IF;
  IF NEW.widget_private AND NEW.feedback_access='admins' AND EXISTS(
    SELECT 1 FROM public.comment_email_batches b JOIN public.comments c ON c.id=b.delivery_id
    WHERE c.project_id=NEW.public_key AND b.status='pending' AND b.lease_token IS NOT NULL
  ) THEN RAISE EXCEPTION 'feedback_delivery_in_progress'; END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION public.fence_comment_delivery_delete()
RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  IF (OLD.github_issue_number IS NULL AND OLD.github_issue_uncertain_at IS NOT NULL)
    OR EXISTS(SELECT 1 FROM public.comment_external_work w WHERE w.comment_id=OLD.id AND w.state='creating' AND w.uncertain_at IS NOT NULL)
    THEN RAISE EXCEPTION 'tracker_dispatch_in_progress'; END IF;
  IF EXISTS(SELECT 1 FROM public.comment_email_batches b WHERE b.delivery_id=OLD.id AND b.status='pending' AND b.lease_token IS NOT NULL)
    THEN RAISE EXCEPTION 'feedback_delivery_in_progress'; END IF;
  RETURN OLD;
END;
$$;
--> statement-breakpoint
CREATE FUNCTION public.begin_actor_tracker_dispatch(p_project text,p_actor uuid,p_comment uuid,p_lease uuid,p_work uuid DEFAULT NULL)
RETURNS boolean LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  PERFORM public.lock_feedback_actor(p_project,p_actor,'integrations:send');
  PERFORM pg_advisory_xact_lock(hashtextextended('crrt-github-issue:' || p_project,0));
  PERFORM 1 FROM public.comments c WHERE c.id=p_comment AND c.project_id=p_project AND c.status IN ('pending','approved') FOR UPDATE;
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
REVOKE ALL ON FUNCTION public.tracker_dispatch_pending(text),public.begin_actor_tracker_dispatch(text,uuid,uuid,uuid,uuid) FROM PUBLIC,anon,authenticated;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.tracker_dispatch_pending(text),public.begin_actor_tracker_dispatch(text,uuid,uuid,uuid,uuid) TO service_role;
--> statement-breakpoint
CREATE FUNCTION public.guard_share_comment_event()
RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $$
DECLARE v_share public.feedback_shares%ROWTYPE; v_project text; v_private boolean;
BEGIN
  IF NEW.comment_id IS NULL THEN RETURN NEW; END IF;
  SELECT s.project_id INTO v_project FROM public.feedback_shares s WHERE s.id=NEW.share_id;
  SELECT p.widget_private INTO v_private FROM public.projects p WHERE p.public_key=v_project FOR SHARE;
  SELECT s.* INTO v_share FROM public.feedback_shares s WHERE s.id=NEW.share_id FOR SHARE;
  IF NOT FOUND OR v_share.revoked_at IS NOT NULL OR v_share.expires_at<=clock_timestamp()
    OR (v_share.created_by='system' AND v_private) THEN RETURN NULL; END IF;
  PERFORM 1 FROM public.comments c WHERE c.id=NEW.comment_id AND c.project_id=v_project AND c.visibility='shared' AND c.status='approved'
    AND (v_share.scope_type <> 'page' OR c.url=v_share.scope_page_url) FOR SHARE;
  IF NOT FOUND THEN RETURN NULL; END IF;
  IF v_share.scope_type <> 'project' THEN
    PERFORM 1 FROM public.feedback_share_items i WHERE i.share_id=NEW.share_id AND i.comment_id=NEW.comment_id FOR SHARE;
    IF NOT FOUND THEN RETURN NULL; END IF;
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER guard_share_comment_event BEFORE INSERT ON public.feedback_events FOR EACH ROW EXECUTE FUNCTION public.guard_share_comment_event();
--> statement-breakpoint
CREATE FUNCTION public.read_agent_operation_key(p_share uuid,p_token_hash text,p_agent text,p_key text)
RETURNS SETOF public.feedback_operation_keys LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  PERFORM public.lock_agent_share(p_share,p_token_hash);
  RETURN QUERY SELECT k.* FROM public.feedback_operation_keys k WHERE k.share_id=p_share AND k.agent_id=p_agent AND k.idempotency_key=p_key;
END;
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION public.guard_share_comment_event(),public.read_agent_operation_key(uuid,text,text,text) FROM PUBLIC,anon,authenticated;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.read_agent_operation_key(uuid,text,text,text) TO service_role;

--> statement-breakpoint

CREATE FUNCTION public.claim_comment_github_issue_v2(
	p_comment_id uuid,
	p_project_key text,
	p_lease_token uuid,
	p_lease_seconds integer,
	p_recovery boolean DEFAULT false
)
RETURNS SETOF public.comments
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
	PERFORM pg_advisory_xact_lock(hashtextextended('crrt-github-issue:' || p_project_key, 0));

	RETURN QUERY
	UPDATE public.comments AS comment
	SET
		github_issue_lease_token = p_lease_token,
		github_issue_lease_expires_at = CASE WHEN p_recovery THEN 'infinity'::timestamptz ELSE now() + make_interval(
			secs => least(greatest(p_lease_seconds, 30), 900)
		) END
	WHERE comment.id = p_comment_id
		AND comment.project_id = p_project_key
		AND comment.status IN ('pending', 'approved')
		AND comment.github_issue_number IS NULL
		AND (
			(p_recovery AND comment.github_issue_uncertain_at IS NOT NULL AND (comment.github_issue_lease_token IS NULL OR comment.github_issue_lease_expires_at = '-infinity'::timestamptz))
			OR
			(NOT p_recovery AND comment.github_issue_uncertain_at IS NULL)
		)
		AND (
			comment.github_issue_lease_token IS NULL
			OR comment.github_issue_lease_expires_at <= now()
		)
	RETURNING comment.*;
END;
$$;
--> statement-breakpoint
CREATE FUNCTION public.release_comment_github_issue_v2(
	p_comment_id uuid,
	p_project_key text,
	p_lease_token uuid
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
	v_updated integer;
BEGIN
	PERFORM pg_advisory_xact_lock(hashtextextended('crrt-github-issue:' || p_project_key, 0));

	UPDATE public.comments AS comment
	SET
		github_issue_lease_token = NULL,
		github_issue_lease_expires_at = NULL
	WHERE comment.id = p_comment_id
		AND comment.project_id = p_project_key
		AND comment.github_issue_lease_token = p_lease_token
		AND comment.github_issue_number IS NULL AND comment.github_issue_uncertain_at IS NULL;

	GET DIAGNOSTICS v_updated = ROW_COUNT;
	RETURN v_updated = 1;
END;
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION public.claim_comment_github_issue_v2(uuid,text,uuid,integer,boolean),public.release_comment_github_issue_v2(uuid,text,uuid) FROM PUBLIC,anon,authenticated;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.claim_comment_github_issue_v2(uuid,text,uuid,integer,boolean),public.release_comment_github_issue_v2(uuid,text,uuid) TO service_role;
--> statement-breakpoint
-- Negative infinity is a durable acknowledgment that this exact sender callback settled.
-- Expired leases and absent coordination sessions are deliberately not acknowledgments.
CREATE FUNCTION public.acknowledge_tracker_dispatch_stopped(p_project text,p_comment uuid,p_lease uuid,p_work uuid DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  PERFORM 1 FROM public.projects WHERE public_key=p_project FOR SHARE;
  PERFORM pg_advisory_xact_lock(hashtextextended('crrt-github-issue:' || p_project,0));
  PERFORM 1 FROM public.comments WHERE id=p_comment AND project_id=p_project FOR UPDATE;
  IF p_work IS NULL THEN
    UPDATE public.comments SET github_issue_lease_expires_at='-infinity'::timestamptz
      WHERE id=p_comment AND project_id=p_project AND github_issue_lease_token=p_lease
        AND github_issue_number IS NULL AND github_issue_uncertain_at IS NOT NULL;
  ELSE
    UPDATE public.comment_external_work SET lease_expires_at='-infinity'::timestamptz,updated_at=now()
      WHERE id=p_work AND project_id=p_project AND comment_id=p_comment AND lease_token=p_lease
        AND state='creating' AND uncertain_at IS NOT NULL;
  END IF;
END;
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION public.acknowledge_tracker_dispatch_stopped(text,uuid,uuid,uuid) FROM PUBLIC,anon,authenticated;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.acknowledge_tracker_dispatch_stopped(text,uuid,uuid,uuid) TO service_role;
--> statement-breakpoint
CREATE FUNCTION public.resolve_actor_tracker_dispatch(p_project text,p_actor uuid,p_comment uuid,p_provider text)
RETURNS boolean LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  IF NOT pg_try_advisory_xact_lock(hashtextextended('crrt-tracker-dispatch:' || p_project,0)) THEN RAISE EXCEPTION 'tracker_dispatch_active'; END IF;
  IF public.lock_feedback_actor(p_project,p_actor,'integrations:send') <> 'admin' THEN RAISE EXCEPTION 'forbidden'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('crrt-github-issue:' || p_project,0));
  PERFORM 1 FROM public.comments c WHERE c.id=p_comment AND c.project_id=p_project FOR UPDATE;
  IF NOT FOUND THEN RETURN false; END IF;
  IF p_provider='github' THEN
    IF EXISTS(SELECT 1 FROM public.comments WHERE id=p_comment AND project_id=p_project AND github_issue_uncertain_at IS NOT NULL AND github_issue_lease_token IS NOT NULL AND github_issue_lease_expires_at IS DISTINCT FROM '-infinity'::timestamptz) THEN RAISE EXCEPTION 'tracker_dispatch_unconfirmed'; END IF;
    UPDATE public.comments c SET github_issue_uncertain_at=NULL,github_issue_lease_token=NULL,github_issue_lease_expires_at=NULL
      WHERE c.id=p_comment AND c.project_id=p_project AND c.github_issue_number IS NULL AND c.github_issue_uncertain_at IS NOT NULL;
    RETURN FOUND;
  END IF;
  IF p_provider NOT IN ('linear','jira') THEN RAISE EXCEPTION 'invalid_provider'; END IF;
  IF EXISTS(SELECT 1 FROM public.comment_external_work WHERE project_id=p_project AND comment_id=p_comment AND provider=p_provider AND state='creating' AND uncertain_at IS NOT NULL AND lease_expires_at IS DISTINCT FROM '-infinity'::timestamptz) THEN RAISE EXCEPTION 'tracker_dispatch_unconfirmed'; END IF;
  DELETE FROM public.comment_external_work w WHERE w.project_id=p_project AND w.comment_id=p_comment AND w.provider=p_provider
    AND w.state='creating' AND w.uncertain_at IS NOT NULL;
  RETURN FOUND;
END;
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION public.resolve_actor_tracker_dispatch(text,uuid,uuid,text) FROM PUBLIC,anon,authenticated;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.resolve_actor_tracker_dispatch(text,uuid,uuid,text) TO service_role;
