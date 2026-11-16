CREATE TABLE "agent_dispatches" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"listener_id" uuid NOT NULL,
	"project_key" text NOT NULL,
	"comment_id" uuid NOT NULL,
	"sender_id" uuid NOT NULL,
	"request_key" uuid NOT NULL,
	"request_hash" text NOT NULL,
	"content_hash" text NOT NULL,
	"state" text DEFAULT 'queued' NOT NULL,
	"work_id" uuid,
	"reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"received_at" timestamp with time zone,
	CONSTRAINT "agent_dispatches_shape" CHECK ("agent_dispatches"."state" in ('queued','received','completed','cancelled') and ("agent_dispatches"."state" <> 'received' or "agent_dispatches"."work_id" is not null))
);
--> statement-breakpoint
ALTER TABLE "agent_dispatches" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "agent_listeners" (
	"id" uuid PRIMARY KEY NOT NULL,
	"connection_id" uuid NOT NULL,
	"project_key" text NOT NULL,
	"user_id" uuid NOT NULL,
	"label" text NOT NULL,
	"repo_url" text NOT NULL,
	"sender_ids" uuid[] NOT NULL,
	"stopped" boolean DEFAULT false NOT NULL,
	"heartbeat_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "agent_listeners_shape" CHECK (length("agent_listeners"."label") between 1 and 80 and length("agent_listeners"."repo_url") between 1 and 500 and cardinality("agent_listeners"."sender_ids") between 1 and 50)
);
--> statement-breakpoint
ALTER TABLE "agent_listeners" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "agent_dispatches" ADD CONSTRAINT "agent_dispatches_listener_id_agent_listeners_id_fk" FOREIGN KEY ("listener_id") REFERENCES "public"."agent_listeners"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_dispatches" ADD CONSTRAINT "agent_dispatches_project_key_projects_public_key_fk" FOREIGN KEY ("project_key") REFERENCES "public"."projects"("public_key") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_dispatches" ADD CONSTRAINT "agent_dispatches_comment_id_comments_id_fk" FOREIGN KEY ("comment_id") REFERENCES "public"."comments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_dispatches" ADD CONSTRAINT "agent_dispatches_sender_id_users_id_fk" FOREIGN KEY ("sender_id") REFERENCES "auth"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_dispatches" ADD CONSTRAINT "agent_dispatches_work_id_feedback_shares_id_fk" FOREIGN KEY ("work_id") REFERENCES "public"."feedback_shares"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_listeners" ADD CONSTRAINT "agent_listeners_connection_id_mcp_connections_id_fk" FOREIGN KEY ("connection_id") REFERENCES "public"."mcp_connections"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_listeners" ADD CONSTRAINT "agent_listeners_project_key_projects_public_key_fk" FOREIGN KEY ("project_key") REFERENCES "public"."projects"("public_key") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_listeners" ADD CONSTRAINT "agent_listeners_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "agent_dispatches_retry" ON "agent_dispatches" USING btree ("sender_id","request_key");--> statement-breakpoint
CREATE UNIQUE INDEX "agent_dispatches_active_comment" ON "agent_dispatches" USING btree ("comment_id") WHERE "agent_dispatches"."state" in ('queued','received');--> statement-breakpoint
CREATE UNIQUE INDEX "agent_dispatches_work" ON "agent_dispatches" USING btree ("work_id");--> statement-breakpoint
CREATE INDEX "agent_dispatches_queue" ON "agent_dispatches" USING btree ("listener_id","created_at");--> statement-breakpoint
CREATE INDEX "agent_listeners_project" ON "agent_listeners" USING btree ("project_key");--> statement-breakpoint
CREATE INDEX "agent_listeners_connection" ON "agent_listeners" USING btree ("connection_id");
--> statement-breakpoint
GRANT ALL ON public.agent_listeners, public.agent_dispatches TO service_role;
--> statement-breakpoint
CREATE FUNCTION public.agent_comment_fingerprint(c public.comments) RETURNS text
LANGUAGE sql IMMUTABLE SET search_path='' AS $$
  SELECT md5(jsonb_build_array(c.project_id,c.comment,c.url,c.element,c.x,c.y,c.target_type,c.anchor,c.image_url,c.screenshot_storage_path,c.visibility)::text)
$$;
--> statement-breakpoint
CREATE FUNCTION public.agent_listener_access(l public.agent_listeners) RETURNS void
LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
  PERFORM public.lock_feedback_actor(l.project_key,l.user_id,'agent:operate');
  PERFORM public.mcp_require_connection(l.connection_id,l.user_id,'crrt:implement');
  PERFORM public.cloud_validate_write(public.cloud_owner(l.project_key));
  PERFORM 1 FROM public.project_repo_configs WHERE project_key=l.project_key AND repo_url=l.repo_url FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'repository_changed'; END IF;
END $$;
--> statement-breakpoint
CREATE FUNCTION public.agent_listener_register(p_actor uuid,p_connection uuid,p_id uuid,p_project text,p_label text,p_repo text,p_senders uuid[])
RETURNS jsonb LANGUAGE plpgsql SET search_path='' AS $$
DECLARE l public.agent_listeners; member uuid; role text;
BEGIN
  role:=public.lock_feedback_actor(p_project,p_actor,'agent:operate');
  PERFORM public.mcp_require_connection(p_connection,p_actor,'crrt:implement');
  PERFORM public.cloud_validate_write(public.cloud_owner(p_project));
  PERFORM 1 FROM public.project_repo_configs WHERE project_key=p_project AND repo_url=p_repo AND repo_url IS NOT NULL FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'repository_mismatch'; END IF;
  IF cardinality(p_senders) IS NULL OR cardinality(p_senders)<1 OR cardinality(p_senders)>50 OR NOT p_actor=ANY(p_senders) THEN RAISE EXCEPTION 'invalid_senders'; END IF;
  FOREACH member IN ARRAY p_senders LOOP
    IF member<>p_actor AND role<>'admin' THEN RAISE EXCEPTION 'forbidden'; END IF;
    PERFORM public.lock_feedback_actor(p_project,member,'agent:operate');
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
CREATE FUNCTION public.agent_dispatch_send(p_actor uuid,p_project text,p_page text,p_listener uuid,p_comment uuid,p_expected timestamptz,p_key uuid)
RETURNS jsonb LANGUAGE plpgsql SET search_path='' AS $$
DECLARE l public.agent_listeners; c public.comments; d public.agent_dispatches; fingerprint text;
BEGIN
  PERFORM public.lock_feedback_actor(p_project,p_actor,'feedback:manage');
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
CREATE FUNCTION public.agent_dispatch_validate(d public.agent_dispatches,l public.agent_listeners) RETURNS void
LANGUAGE plpgsql SET search_path='' AS $$
DECLARE c public.comments;
BEGIN
  PERFORM public.agent_listener_access(l);
  PERFORM public.lock_feedback_actor(d.project_key,d.sender_id,'feedback:manage');
  IF NOT d.sender_id=ANY(l.sender_ids) THEN RAISE EXCEPTION 'sender_removed'; END IF;
  IF l.stopped OR d.state='cancelled' THEN RAISE EXCEPTION 'listener_stopped'; END IF;
  SELECT * INTO c FROM public.comments WHERE id=d.comment_id AND project_id=d.project_key FOR UPDATE;
  IF NOT FOUND OR c.status<>'approved' OR public.agent_comment_fingerprint(c)<>d.content_hash THEN RAISE EXCEPTION 'feedback_changed'; END IF;
END $$;
--> statement-breakpoint
CREATE FUNCTION public.agent_listener_poll(p_actor uuid,p_connection uuid,p_id uuid,p_share jsonb)
RETURNS jsonb LANGUAGE plpgsql SET search_path='' AS $$
DECLARE l public.agent_listeners; d public.agent_dispatches; work uuid; failure text;
BEGIN
  SELECT * INTO l FROM public.agent_listeners WHERE id=p_id AND user_id=p_actor AND connection_id=p_connection;
  IF NOT FOUND THEN RAISE EXCEPTION 'listener_not_found'; END IF;
  PERFORM public.agent_listener_access(l);
  SELECT * INTO l FROM public.agent_listeners WHERE id=p_id FOR UPDATE;
  IF l.stopped THEN RAISE EXCEPTION 'listener_stopped'; END IF;
  UPDATE public.agent_listeners SET heartbeat_at=clock_timestamp() WHERE id=l.id;
  -- A received work is replayed until finished, including after lost HTTP responses.
  SELECT * INTO d FROM public.agent_dispatches WHERE listener_id=l.id AND state IN ('received','queued')
    ORDER BY (state='received') DESC,created_at,id LIMIT 1;
  IF NOT FOUND THEN RETURN jsonb_build_object('state','waiting'); END IF;
  BEGIN
    PERFORM public.agent_dispatch_validate(d,l);
  EXCEPTION WHEN raise_exception THEN
    GET STACKED DIAGNOSTICS failure=MESSAGE_TEXT;
    UPDATE public.agent_dispatches SET state='cancelled',reason=failure WHERE id=d.id;
    RETURN jsonb_build_object('state','cancelled','dispatchId',d.id,'reason',failure);
  END;
  IF d.work_id IS NULL THEN
    work:=public.mcp_prepare_work(p_connection,p_actor,l.project_key,ARRAY[d.comment_id],d.id::text,
      encode(sha256(convert_to(d.id::text,'UTF8')),'hex'),p_share);
    UPDATE public.agent_dispatches SET work_id=work,state='received',received_at=clock_timestamp() WHERE id=d.id RETURNING * INTO d;
  END IF;
  RETURN jsonb_build_object('state','received','dispatchId',d.id,'workId',d.work_id,'projectId',d.project_key,'feedbackId',d.comment_id,'repoUrl',l.repo_url);
END $$;
--> statement-breakpoint
CREATE FUNCTION public.agent_listener_stop(p_actor uuid,p_connection uuid,p_id uuid) RETURNS void
LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
  PERFORM public.mcp_require_connection(p_connection,p_actor,'crrt:implement');
  UPDATE public.agent_listeners SET stopped=true WHERE id=p_id AND user_id=p_actor AND connection_id=p_connection;
  IF NOT FOUND THEN RAISE EXCEPTION 'listener_not_found'; END IF;
END $$;
--> statement-breakpoint
CREATE FUNCTION public.agent_dispatch_guard(p_actor uuid,p_connection uuid,p_work uuid,p_op text) RETURNS void
LANGUAGE plpgsql SET search_path='' AS $$
DECLARE l public.agent_listeners; d public.agent_dispatches;
BEGIN
  SELECT * INTO d FROM public.agent_dispatches WHERE work_id=p_work;
  IF NOT FOUND THEN RETURN; END IF;
  SELECT * INTO l FROM public.agent_listeners WHERE id=d.listener_id FOR UPDATE;
  IF l.user_id<>p_actor OR l.connection_id<>p_connection THEN RAISE EXCEPTION 'forbidden'; END IF;
  IF d.state='completed' AND p_op<>'complete' THEN RAISE EXCEPTION 'dispatch_completed'; END IF;
  PERFORM public.agent_dispatch_validate(d,l);
  UPDATE public.agent_listeners SET heartbeat_at=clock_timestamp() WHERE id=l.id;
END $$;
--> statement-breakpoint
CREATE FUNCTION public.agent_dispatch_progress() RETURNS trigger
LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
  IF NEW.implementation_status IN ('ready_for_testing','done') THEN
    UPDATE public.agent_dispatches SET state='completed' WHERE comment_id=NEW.id AND state='received';
  ELSIF NEW.status IS DISTINCT FROM 'approved' THEN
    UPDATE public.agent_dispatches SET state='cancelled',reason='review_changed' WHERE comment_id=NEW.id AND state IN ('queued','received');
  END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER agent_dispatch_progress AFTER UPDATE OF status,implementation_status ON public.comments
  FOR EACH ROW EXECUTE FUNCTION public.agent_dispatch_progress();
--> statement-breakpoint
REVOKE ALL ON FUNCTION public.agent_comment_fingerprint(public.comments), public.agent_listener_access(public.agent_listeners), public.agent_listener_register(uuid,uuid,uuid,text,text,text,uuid[]), public.agent_dispatch_send(uuid,text,text,uuid,uuid,timestamptz,uuid), public.agent_dispatch_validate(public.agent_dispatches,public.agent_listeners), public.agent_listener_poll(uuid,uuid,uuid,jsonb), public.agent_listener_stop(uuid,uuid,uuid), public.agent_dispatch_guard(uuid,uuid,uuid,text), public.agent_dispatch_progress() FROM PUBLIC,anon,authenticated;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.agent_comment_fingerprint(public.comments), public.agent_listener_access(public.agent_listeners), public.agent_listener_register(uuid,uuid,uuid,text,text,text,uuid[]), public.agent_dispatch_send(uuid,text,text,uuid,uuid,timestamptz,uuid), public.agent_dispatch_validate(public.agent_dispatches,public.agent_listeners), public.agent_listener_poll(uuid,uuid,uuid,jsonb), public.agent_listener_stop(uuid,uuid,uuid), public.agent_dispatch_guard(uuid,uuid,uuid,text), public.agent_dispatch_progress() TO service_role;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION public.mcp_work_operation(p_connection uuid,p_actor uuid,p_work uuid,p_agent text,p_comment uuid,p_op text,p_key text,p_summary text,p_request_hash text)
RETURNS jsonb LANGUAGE plpgsql SET search_path='' AS $$
DECLARE item public.feedback_shares; feedback public.comments; agent text; target text; event text; result record; old_hash text;
BEGIN
  SELECT s.* INTO item FROM public.mcp_workflows w JOIN public.feedback_shares s ON s.id=w.share_id
    WHERE w.share_id=p_work AND w.connection_id=p_connection;
  IF NOT FOUND THEN RAISE EXCEPTION 'work_unavailable'; END IF;
  PERFORM public.lock_feedback_actor(item.project_id,p_actor,'agent:operate');
  PERFORM public.mcp_require_connection(p_connection,p_actor,'crrt:implement');
  PERFORM public.cloud_validate_write(public.cloud_owner(item.project_id));
  PERFORM public.agent_dispatch_guard(p_actor,p_connection,p_work,p_op);
  PERFORM public.lock_agent_share(item.id,item.access_token_hash);
  IF p_agent !~ '^[A-Za-z0-9_-]{1,64}$' OR length(p_summary)>2000 OR p_summary IS NULL OR btrim(p_summary)='' THEN RAISE EXCEPTION 'invalid_agent_request'; END IF;
  agent:='mcp:'||p_work::text||':'||p_agent;
  IF p_op IN ('reading','idle','working','blocked') AND p_comment IS NULL THEN
    PERFORM public.write_agent_presence(item.id,item.access_token_hash,agent,p_op,p_summary);
    RETURN jsonb_build_object('outcome','applied','projectId',item.project_id);
  END IF;
  IF p_op NOT IN ('claim','start','note','block','complete') OR p_key !~ '^[A-Za-z0-9_-]{16,128}$'
    OR p_request_hash !~ '^[0-9a-f]{64}$' THEN RAISE EXCEPTION 'invalid_agent_request'; END IF;
  -- Serialize the complete retry decision before locking individual comments.
  PERFORM pg_advisory_xact_lock(hashtextextended('crrt-mcp-op:'||p_work::text||':'||agent||':'||p_key,0));
  SELECT * INTO feedback FROM public.comments WHERE id=p_comment AND project_id=item.project_id AND status='approved' FOR UPDATE;
  IF NOT FOUND OR NOT EXISTS(SELECT 1 FROM public.feedback_share_items WHERE share_id=p_work AND comment_id=p_comment) THEN RAISE EXCEPTION 'feedback_not_eligible'; END IF;
  SELECT e.payload->>'mcpRequestHash' INTO old_hash FROM public.feedback_operation_keys k JOIN public.feedback_events e ON e.id=k.feedback_event_id
    WHERE k.share_id=p_work AND k.agent_id=agent AND k.idempotency_key=p_key;
  IF FOUND THEN
    IF old_hash IS DISTINCT FROM p_request_hash THEN RAISE EXCEPTION 'idempotency_conflict'; END IF;
    RETURN jsonb_build_object('outcome','duplicate','projectId',item.project_id,'feedbackId',p_comment,'implementationStatus',feedback.implementation_status);
  END IF;
  IF p_op<>'claim' AND feedback.claimed_by_agent_id IS DISTINCT FROM agent THEN RAISE EXCEPTION 'claim_required'; END IF;
  IF p_op='claim' AND feedback.claimed_by_agent_id=agent THEN
    -- Persist the retry proof without changing reviewer-owned or in-progress status.
    SELECT * INTO result FROM public.apply_agent_feedback_operation_unchecked(item.id,p_comment,agent,p_key,'comment.claim','comment.claimed',
      jsonb_build_object('summary',p_summary,'mcpRequestHash',p_request_hash,'noOp',true),NULL);
    IF result.outcome NOT IN ('applied','duplicate') THEN RAISE EXCEPTION '%',result.outcome; END IF;
    RETURN jsonb_build_object('outcome','duplicate','projectId',item.project_id,'feedbackId',p_comment,'implementationStatus',feedback.implementation_status);
  END IF;
  target:=CASE p_op WHEN 'claim' THEN 'claimed' WHEN 'start' THEN 'in_progress' WHEN 'block' THEN 'blocked' WHEN 'complete' THEN 'ready_for_testing' ELSE NULL END;
  event:=CASE p_op WHEN 'claim' THEN 'comment.claimed' WHEN 'start' THEN 'comment.started' WHEN 'block' THEN 'comment.blocked' WHEN 'complete' THEN 'comment.ready_for_testing' ELSE 'comment.noted' END;
  SELECT * INTO result FROM public.apply_agent_feedback_operation_unchecked(item.id,p_comment,agent,p_key,'comment.'||p_op,event,
    jsonb_build_object('summary',p_summary,'mcpRequestHash',p_request_hash),target);
  IF result.outcome NOT IN ('applied','duplicate') THEN RAISE EXCEPTION '%',result.outcome; END IF;
  PERFORM public.write_agent_presence(item.id,item.access_token_hash,agent,CASE p_op WHEN 'block' THEN 'blocked' WHEN 'complete' THEN 'idle' WHEN 'claim' THEN 'idle' ELSE 'working' END,p_summary);
  RETURN jsonb_build_object('outcome',result.outcome,'projectId',item.project_id,'feedbackId',p_comment,'implementationStatus',coalesce(result.comment_row->>'implementation_status',feedback.implementation_status));
END;
$$;
--> statement-breakpoint
