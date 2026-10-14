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
