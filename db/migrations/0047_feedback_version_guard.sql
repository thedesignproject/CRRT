CREATE OR REPLACE FUNCTION public.mutate_actor_feedback(p_project text, p_actor uuid, p_comment uuid, p_patch jsonb)
RETURNS SETOF public.comments LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  PERFORM public.lock_feedback_actor(p_project,p_actor,'feedback:manage');
  PERFORM pg_advisory_xact_lock(hashtextextended('crrt-github-issue:' || p_project,0));
  PERFORM 1 FROM public.comments c WHERE c.id=p_comment AND c.project_id=p_project FOR UPDATE;
  IF NOT FOUND THEN RETURN; END IF;
  IF p_patch ? 'expected_updated_at' AND NOT EXISTS (
    SELECT 1 FROM public.comments c WHERE c.id=p_comment AND c.project_id=p_project
      AND c.updated_at = (p_patch->>'expected_updated_at')::timestamptz
  ) THEN RAISE EXCEPTION 'status_conflict'; END IF;
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
