CREATE OR REPLACE FUNCTION public.read_widget_agent_feedback(p_project text,p_actor uuid,p_page_url text)
RETURNS SETOF public.comments LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  PERFORM public.lock_feedback_actor(p_project,p_actor,'agent:operate');
  RETURN QUERY SELECT c.* FROM public.comments c
    WHERE c.project_id=p_project AND c.url=p_page_url AND c.visibility='shared'
      AND c.status IN ('pending','approved')
      AND coalesce(c.implementation_status,'unassigned') <> 'done'
    ORDER BY c.created_at DESC FOR SHARE;
END;
$$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION public.mutate_widget_feedback_batch(
  p_project text,
  p_actor uuid,
  p_page_url text,
  p_comments uuid[],
  p_action text
)
RETURNS SETOF public.comments LANGUAGE plpgsql SET search_path = '' AS $$
DECLARE
  v_requested uuid[];
  v_ids uuid[];
  v_id uuid;
BEGIN
  IF p_page_url IS NULL OR p_page_url = '' OR p_action NOT IN ('accept','reject','resolve')
    OR cardinality(p_comments) IS NULL OR cardinality(p_comments) < 1 OR cardinality(p_comments) > 100 THEN
    RAISE EXCEPTION 'invalid_widget_feedback_request';
  END IF;
  SELECT array_agg(DISTINCT requested.id ORDER BY requested.id)
    INTO v_requested FROM unnest(p_comments) requested(id);
  IF cardinality(v_requested) <> cardinality(p_comments) THEN RAISE EXCEPTION 'invalid_selection'; END IF;

  PERFORM public.lock_feedback_actor(p_project,p_actor,'feedback:manage');
  PERFORM pg_advisory_xact_lock(hashtextextended('crrt-github-issue:' || p_project,0));
  SELECT array_agg(selected.id ORDER BY selected.id) INTO v_ids FROM (
    SELECT c.id FROM public.comments c
      WHERE c.id=ANY(v_requested) AND c.project_id=p_project AND c.url=p_page_url
        AND c.visibility='shared'
        AND CASE WHEN p_action='resolve'
          THEN c.status='approved' AND coalesce(c.implementation_status,'unassigned') <> 'done'
          ELSE c.status IN ('pending','approved','rejected') END
      ORDER BY c.id FOR UPDATE
  ) selected;
  IF cardinality(v_ids) IS NULL OR cardinality(v_ids) <> cardinality(v_requested) THEN
    RAISE EXCEPTION 'invalid_selection';
  END IF;

  IF p_action IN ('accept','reject') THEN
    FOREACH v_id IN ARRAY v_ids LOOP
      PERFORM * FROM public.update_comment_review_status(
        v_id,p_project,CASE WHEN p_action='accept' THEN 'approved' ELSE 'rejected' END
      );
    END LOOP;
  ELSE
    UPDATE public.comments c SET implementation_status='done',claimed_by_agent_id=null,updated_at=now()
      WHERE c.id=ANY(v_ids) AND c.project_id=p_project;
  END IF;
  RETURN QUERY SELECT c.* FROM public.comments c WHERE c.id=ANY(v_ids) AND c.project_id=p_project
    ORDER BY c.created_at DESC;
END;
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION public.read_widget_agent_feedback(text,uuid,text),
  public.mutate_widget_feedback_batch(text,uuid,text,uuid[],text) FROM PUBLIC,anon,authenticated;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.read_widget_agent_feedback(text,uuid,text),
  public.mutate_widget_feedback_batch(text,uuid,text,uuid[],text) TO service_role;
--> statement-breakpoint
NOTIFY pgrst, 'reload schema';
