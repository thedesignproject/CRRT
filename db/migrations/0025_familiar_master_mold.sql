DROP VIEW "public"."admin_project_metrics";--> statement-breakpoint
CREATE VIEW "public"."admin_project_metrics" WITH (security_invoker = true) AS (
    with comment_metrics as (
      select project_id,
        count(*)::bigint as comment_count,
        count(*) filter (where status is null or status not in ('approved', 'accepted', 'rejected'))::bigint as pending_comment_count,
        count(*) filter (where status in ('approved', 'accepted'))::bigint as accepted_comment_count,
        count(*) filter (where status = 'rejected')::bigint as rejected_comment_count,
        count(*) filter (where implementation_status is null or implementation_status = 'unassigned')::bigint as unassigned_comment_count,
        count(*) filter (where implementation_status = 'claimed')::bigint as claimed_comment_count,
        count(*) filter (where implementation_status = 'in_progress')::bigint as in_progress_comment_count,
        count(*) filter (where implementation_status = 'blocked')::bigint as blocked_comment_count,
        count(*) filter (where implementation_status = 'ready_for_testing')::bigint as ready_for_testing_comment_count,
        count(*) filter (where implementation_status = 'done')::bigint as done_comment_count,
        count(distinct url)::bigint as commented_url_count,
        min(created_at) as first_comment_at,
        max(created_at) as last_comment_at
      from "comments"
      group by project_id
    ), share_metrics as (
      select project_id, count(*)::bigint as feedback_share_count
      from "feedback_shares"
      group by project_id
    )
    select p.public_key, p.name, p.claimable, p.created_at,
      cm.comment_count, cm.pending_comment_count, cm.accepted_comment_count,
      cm.rejected_comment_count, cm.unassigned_comment_count,
      cm.claimed_comment_count, cm.in_progress_comment_count,
      cm.blocked_comment_count, cm.ready_for_testing_comment_count,
      cm.done_comment_count,
      coalesce(sm.feedback_share_count, 0)::bigint as feedback_share_count,
      cm.commented_url_count, cm.first_comment_at, cm.last_comment_at
    from "projects" p
    join comment_metrics cm on cm.project_id = p.public_key
    left join share_metrics sm on sm.project_id = p.public_key
  );--> statement-breakpoint
GRANT SELECT ON TABLE public.admin_project_metrics TO service_role;--> statement-breakpoint
CREATE OR REPLACE FUNCTION public.apply_agent_feedback_operation(
  p_share_id uuid,
  p_comment_id uuid,
  p_agent_id text,
  p_idempotency_key text,
  p_operation text,
  p_event_type text,
  p_payload jsonb,
  p_implementation_status text
)
RETURNS TABLE(outcome text, event_id bigint, comment_row jsonb)
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_reserved boolean := false;
  v_event_id bigint;
  v_comment public.comments%ROWTYPE;
BEGIN
  INSERT INTO public.feedback_operation_keys (
    share_id,
    agent_id,
    idempotency_key,
    feedback_event_id
  ) VALUES (
    p_share_id,
    p_agent_id,
    p_idempotency_key,
    null
  )
  ON CONFLICT (share_id, agent_id, idempotency_key) DO NOTHING
  RETURNING true INTO v_reserved;

  IF NOT coalesce(v_reserved, false) THEN
    SELECT operation_key.feedback_event_id
      INTO v_event_id
      FROM public.feedback_operation_keys operation_key
     WHERE operation_key.share_id = p_share_id
       AND operation_key.agent_id = p_agent_id
       AND operation_key.idempotency_key = p_idempotency_key;
    RETURN QUERY SELECT 'duplicate'::text, v_event_id, null::jsonb;
    RETURN;
  END IF;

  SELECT c.*
    INTO v_comment
    FROM public.comments c
   WHERE c.id = p_comment_id
   FOR UPDATE;

  IF NOT FOUND THEN
    DELETE FROM public.feedback_operation_keys operation_key
     WHERE operation_key.share_id = p_share_id
       AND operation_key.agent_id = p_agent_id
       AND operation_key.idempotency_key = p_idempotency_key;
    RETURN QUERY SELECT 'not_found'::text, null::bigint, null::jsonb;
    RETURN;
  END IF;

  IF v_comment.claimed_by_agent_id IS NOT NULL
     AND v_comment.claimed_by_agent_id <> p_agent_id
     AND p_operation <> 'comment.reopen' THEN
    DELETE FROM public.feedback_operation_keys operation_key
     WHERE operation_key.share_id = p_share_id
       AND operation_key.agent_id = p_agent_id
       AND operation_key.idempotency_key = p_idempotency_key;
    RETURN QUERY SELECT 'claimed_conflict'::text, null::bigint, null::jsonb;
    RETURN;
  END IF;

  IF v_comment.implementation_status IN ('ready_for_testing', 'done')
     AND p_implementation_status IS NOT NULL THEN
    DELETE FROM public.feedback_operation_keys operation_key
     WHERE operation_key.share_id = p_share_id
       AND operation_key.agent_id = p_agent_id
       AND operation_key.idempotency_key = p_idempotency_key;
    RETURN QUERY SELECT 'reviewer_owned'::text, null::bigint, null::jsonb;
    RETURN;
  END IF;

  IF p_implementation_status IS NOT NULL THEN
    UPDATE public.comments
       SET implementation_status = p_implementation_status,
           claimed_by_agent_id = CASE
             WHEN p_operation = 'comment.reopen' THEN null
             ELSE p_agent_id
           END,
           updated_at = now()
     WHERE id = p_comment_id
     RETURNING * INTO v_comment;
  END IF;

  INSERT INTO public.feedback_events (
    share_id,
    comment_id,
    actor_type,
    actor_id,
    event_type,
    payload
  ) VALUES (
    p_share_id,
    p_comment_id,
    'agent',
    p_agent_id,
    p_event_type,
    coalesce(p_payload, '{}'::jsonb)
  )
  RETURNING id INTO v_event_id;

  UPDATE public.feedback_operation_keys operation_key
     SET feedback_event_id = v_event_id
   WHERE operation_key.share_id = p_share_id
     AND operation_key.agent_id = p_agent_id
     AND operation_key.idempotency_key = p_idempotency_key;

  RETURN QUERY SELECT 'applied'::text, v_event_id, to_jsonb(v_comment);
END;
$$;--> statement-breakpoint
REVOKE ALL ON FUNCTION public.apply_agent_feedback_operation(uuid, uuid, text, text, text, text, jsonb, text) FROM PUBLIC;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.apply_agent_feedback_operation(uuid, uuid, text, text, text, text, jsonb, text) TO service_role;--> statement-breakpoint
NOTIFY pgrst, 'reload schema';
