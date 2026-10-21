CREATE OR REPLACE FUNCTION public.create_storybook_comment(p_connection uuid,p_actor uuid,p_origin text,p_token_hash text,p_comment jsonb)
RETURNS uuid LANGUAGE plpgsql SET search_path = '' AS $$
DECLARE v_project text; v_id uuid;
BEGIN
  SELECT project_key INTO v_project FROM public.storybook_connections WHERE id=p_connection;
  PERFORM public.lock_feedback_actor(v_project,p_actor,'feedback:read');
  PERFORM 1 FROM public.storybook_connections WHERE id=p_connection AND claimed_at IS NOT NULL AND revoked_at IS NULL FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'access_denied'; END IF;
  PERFORM 1 FROM public.widget_auth_sessions WHERE token_hash=p_token_hash AND user_id=p_actor AND project_key=v_project
    AND storybook_connection_id=p_connection AND origin=p_origin AND expires_at>clock_timestamp() FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'session_expired'; END IF;
  INSERT INTO public.comments(project_id,source,visibility,url,x,y,element,comment,status,implementation_status,created_by,created_by_user_id,author_name,screenshot_storage_path)
  VALUES(v_project,'widget','shared',p_comment->>'pageUrl',(p_comment->>'x')::float8,(p_comment->>'y')::float8,
    p_comment->>'selector',p_comment->>'body','pending','unassigned','public',p_actor,p_comment->>'authorName',p_comment->>'screenshotStoragePath') RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;
--> statement-breakpoint
NOTIFY pgrst, 'reload schema';
