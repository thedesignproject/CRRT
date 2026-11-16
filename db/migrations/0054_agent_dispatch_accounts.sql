CREATE FUNCTION public.agent_dispatch_actor(p_project text,p_actor uuid,p_capability text)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE role text;
BEGIN
  role:=public.lock_feedback_actor(p_project,p_actor,p_capability);
  PERFORM 1 FROM auth.users WHERE id=p_actor AND deleted_at IS NULL AND (banned_until IS NULL OR banned_until<now()) FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'forbidden'; END IF;
  RETURN role;
END $$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION public.agent_dispatch_actor(text,uuid,text) FROM PUBLIC,anon,authenticated;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.agent_dispatch_actor(text,uuid,text) TO service_role;
--> statement-breakpoint

CREATE OR REPLACE FUNCTION public.agent_listener_access(l public.agent_listeners) RETURNS void
LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
  PERFORM public.agent_dispatch_actor(l.project_key,l.user_id,'agent:operate');
  PERFORM public.mcp_require_connection(l.connection_id,l.user_id,'crrt:implement');
  PERFORM public.cloud_validate_write(public.cloud_owner(l.project_key));
  PERFORM 1 FROM public.project_repo_configs WHERE project_key=l.project_key AND repo_url=l.repo_url FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'repository_changed'; END IF;
END $$;

--> statement-breakpoint

CREATE OR REPLACE FUNCTION public.agent_listener_register(p_actor uuid,p_connection uuid,p_id uuid,p_project text,p_label text,p_repo text,p_senders uuid[])
RETURNS jsonb LANGUAGE plpgsql SET search_path='' AS $$
DECLARE l public.agent_listeners; member uuid; role text;
BEGIN
  role:=public.agent_dispatch_actor(p_project,p_actor,'agent:operate');
  PERFORM public.mcp_require_connection(p_connection,p_actor,'crrt:implement');
  PERFORM public.cloud_validate_write(public.cloud_owner(p_project));
  PERFORM 1 FROM public.project_repo_configs WHERE project_key=p_project AND repo_url=p_repo AND repo_url IS NOT NULL FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'repository_mismatch'; END IF;
  IF cardinality(p_senders) IS NULL OR cardinality(p_senders)<1 OR cardinality(p_senders)>50 OR NOT p_actor=ANY(p_senders) THEN RAISE EXCEPTION 'invalid_senders'; END IF;
  FOREACH member IN ARRAY p_senders LOOP
    IF member<>p_actor AND role<>'admin' THEN RAISE EXCEPTION 'forbidden'; END IF;
    PERFORM public.agent_dispatch_actor(p_project,member,'agent:operate');
  END LOOP;
  PERFORM pg_advisory_xact_lock(hashtextextended('listener:'||p_connection::text,0));
  SELECT * INTO l FROM public.agent_listeners WHERE id=p_id FOR UPDATE;
  IF FOUND THEN
    IF l.connection_id<>p_connection OR l.project_key<>p_project OR l.user_id<>p_actor OR l.repo_url<>p_repo THEN RAISE EXCEPTION 'listener_conflict'; END IF;
    UPDATE public.agent_listeners SET label=p_label,sender_ids=p_senders,stopped=false,heartbeat_at=clock_timestamp() WHERE id=p_id RETURNING * INTO l;
  ELSE
    IF (SELECT count(*) FROM public.agent_listeners WHERE connection_id=p_connection AND NOT stopped)>=8 THEN RAISE EXCEPTION 'listener_limit'; END IF;
    INSERT INTO public.agent_listeners(id,connection_id,project_key,user_id,label,repo_url,sender_ids)
      VALUES(p_id,p_connection,p_project,p_actor,p_label,p_repo,p_senders) RETURNING * INTO l;
  END IF;
  RETURN jsonb_build_object('listenerId',l.id,'projectId',l.project_key,'label',l.label,'repoUrl',l.repo_url);
END $$;

--> statement-breakpoint

CREATE OR REPLACE FUNCTION public.agent_dispatch_send(p_actor uuid,p_project text,p_page text,p_listener uuid,p_comment uuid,p_expected timestamptz,p_key uuid)
RETURNS jsonb LANGUAGE plpgsql SET search_path='' AS $$
DECLARE l public.agent_listeners; c public.comments; d public.agent_dispatches; fingerprint text;
BEGIN
  PERFORM public.agent_dispatch_actor(p_project,p_actor,'feedback:manage');
  PERFORM public.cloud_validate_write(public.cloud_owner(p_project));
  PERFORM pg_advisory_xact_lock(hashtextextended('send:'||p_actor::text||':'||p_key::text,0));
  SELECT * INTO l FROM public.agent_listeners WHERE id=p_listener AND project_key=p_project FOR UPDATE;
  IF NOT FOUND OR NOT p_actor=ANY(l.sender_ids) THEN RAISE EXCEPTION 'forbidden'; END IF;
  PERFORM public.agent_listener_access(l);
  fingerprint:=md5(jsonb_build_array(p_project,p_page,p_listener,p_comment,p_expected)::text);
  SELECT * INTO d FROM public.agent_dispatches WHERE sender_id=p_actor AND request_key=p_key;
  IF FOUND THEN
    IF d.request_hash<>fingerprint THEN RAISE EXCEPTION 'idempotency_conflict'; END IF;
    RETURN jsonb_build_object('dispatchId',d.id,'state',d.state);
  END IF;
  IF l.stopped OR l.heartbeat_at<clock_timestamp()-interval '60 seconds' THEN RAISE EXCEPTION 'listener_offline'; END IF;
  SELECT * INTO c FROM public.comments WHERE id=p_comment AND project_id=p_project AND url=p_page FOR UPDATE;
  IF NOT FOUND OR c.updated_at IS DISTINCT FROM p_expected THEN RAISE EXCEPTION 'feedback_changed'; END IF;
  IF c.status NOT IN ('pending','approved') OR coalesce(c.implementation_status,'unassigned')<>'unassigned' OR c.claimed_by_agent_id IS NOT NULL THEN RAISE EXCEPTION 'feedback_not_eligible'; END IF;
  IF EXISTS(SELECT 1 FROM public.agent_dispatches WHERE comment_id=c.id AND state IN ('queued','received')) THEN RAISE EXCEPTION 'already_sent'; END IF;
  -- SEND is the authenticated human review decision, never model inference.
  PERFORM public.mutate_actor_feedback(p_project,p_actor,p_comment,jsonb_build_object('status','approved'));
  INSERT INTO public.agent_dispatches(listener_id,project_key,comment_id,sender_id,request_key,request_hash,content_hash)
    VALUES(l.id,p_project,c.id,p_actor,p_key,fingerprint,public.agent_comment_fingerprint(c)) RETURNING * INTO d;
  RETURN jsonb_build_object('dispatchId',d.id,'state',d.state);
END $$;

--> statement-breakpoint

CREATE OR REPLACE FUNCTION public.agent_dispatch_validate(d public.agent_dispatches,l public.agent_listeners) RETURNS void
LANGUAGE plpgsql SET search_path='' AS $$
DECLARE c public.comments;
BEGIN
  PERFORM public.agent_listener_access(l);
  PERFORM public.agent_dispatch_actor(d.project_key,d.sender_id,'feedback:manage');
  IF NOT d.sender_id=ANY(l.sender_ids) THEN RAISE EXCEPTION 'sender_removed'; END IF;
  IF l.stopped OR d.state='cancelled' THEN RAISE EXCEPTION 'listener_stopped'; END IF;
  SELECT * INTO c FROM public.comments WHERE id=d.comment_id AND project_id=d.project_key FOR UPDATE;
  IF NOT FOUND OR c.status<>'approved' OR public.agent_comment_fingerprint(c)<>d.content_hash THEN RAISE EXCEPTION 'feedback_changed'; END IF;
END $$;
