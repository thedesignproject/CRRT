CREATE FUNCTION public.assign_actor_inbox_feedback_with_versions(p_actor uuid, p_project text, p_ids uuid[], p_visibility text)
RETURNS TABLE(id uuid, updated_at timestamptz) LANGUAGE plpgsql SET search_path = '' AS $$
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
    RETURNING c.id,c.updated_at;
END;
$$;

--> statement-breakpoint
CREATE FUNCTION public.restore_actor_inbox_feedback(p_actor uuid,p_project text,p_items jsonb)
RETURNS TABLE(id uuid) LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  PERFORM public.lock_feedback_actor(p_project,p_actor,'feedback:manage');
  PERFORM pg_advisory_xact_lock(hashtextextended('crrt-github-issue:' || p_project,0));
  IF jsonb_typeof(p_items) IS DISTINCT FROM 'array' OR jsonb_array_length(p_items) NOT BETWEEN 1 AND 500 THEN RAISE EXCEPTION 'invalid_selection'; END IF;
  -- Lock rows before checking references: share creation takes FOR SHARE and
  -- must finish first (or wait until the project assignment has been removed).
  PERFORM 1 FROM public.comments c JOIN jsonb_to_recordset(p_items) AS x(id uuid,updated_at timestamptz) ON x.id=c.id
    WHERE c.project_id=p_project ORDER BY c.id FOR UPDATE OF c;
  RETURN QUERY UPDATE public.comments c SET project_id=NULL,visibility='shared',updated_at=now()
    FROM jsonb_to_recordset(p_items) AS x(id uuid,updated_at timestamptz)
    WHERE c.id=x.id AND c.project_id=p_project AND c.source='extension' AND c.created_by_user_id=p_actor
      AND c.updated_at=x.updated_at
      AND NOT EXISTS(SELECT 1 FROM public.feedback_share_items i WHERE i.comment_id=c.id)
      AND NOT EXISTS(SELECT 1 FROM public.comment_external_work w WHERE w.comment_id=c.id)
    RETURNING c.id;
END;
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION public.assign_actor_inbox_feedback_with_versions(uuid,text,uuid[],text), public.restore_actor_inbox_feedback(uuid,text,jsonb) FROM PUBLIC,anon,authenticated;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.assign_actor_inbox_feedback_with_versions(uuid,text,uuid[],text), public.restore_actor_inbox_feedback(uuid,text,jsonb) TO service_role;
--> statement-breakpoint
NOTIFY pgrst, 'reload schema';
