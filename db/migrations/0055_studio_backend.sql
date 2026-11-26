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
CREATE TABLE "brain_rules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_user_id" uuid NOT NULL,
	"project_key" text,
	"title" text NOT NULL,
	"body" text NOT NULL,
	"author_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "brain_rules_title_length" CHECK (length("brain_rules"."title") between 1 and 120),
	CONSTRAINT "brain_rules_body_length" CHECK (length("brain_rules"."body") between 1 and 4000)
);
--> statement-breakpoint
ALTER TABLE "brain_rules" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "next_step_comments" (
	"next_step_id" uuid NOT NULL,
	"comment_id" uuid NOT NULL,
	CONSTRAINT "next_step_comments_next_step_id_comment_id_pk" PRIMARY KEY("next_step_id","comment_id")
);
--> statement-breakpoint
ALTER TABLE "next_step_comments" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "next_step_rule_citations" (
	"next_step_id" uuid NOT NULL,
	"rule_id" uuid NOT NULL,
	"agent_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "next_step_rule_citations_next_step_id_rule_id_pk" PRIMARY KEY("next_step_id","rule_id")
);
--> statement-breakpoint
ALTER TABLE "next_step_rule_citations" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "next_steps" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_key" text NOT NULL,
	"group_key" text NOT NULL,
	"title" text NOT NULL,
	"tag" text NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"conflict_rule_id" uuid,
	"conflict_question" text,
	"conflict_decision" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone,
	CONSTRAINT "next_steps_status_check" CHECK ("next_steps"."status" in ('open', 'paused', 'done')),
	CONSTRAINT "next_steps_conflict_decision_check" CHECK ("next_steps"."conflict_decision" in ('keep_rule', 'update_rule'))
);
--> statement-breakpoint
ALTER TABLE "next_steps" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "workspaces" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "workspaces_name_length" CHECK (length("workspaces"."name") between 1 and 60)
);
--> statement-breakpoint
ALTER TABLE "workspaces" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "agent_dispatches" ADD CONSTRAINT "agent_dispatches_listener_id_agent_listeners_id_fk" FOREIGN KEY ("listener_id") REFERENCES "public"."agent_listeners"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_dispatches" ADD CONSTRAINT "agent_dispatches_project_key_projects_public_key_fk" FOREIGN KEY ("project_key") REFERENCES "public"."projects"("public_key") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_dispatches" ADD CONSTRAINT "agent_dispatches_comment_id_comments_id_fk" FOREIGN KEY ("comment_id") REFERENCES "public"."comments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_dispatches" ADD CONSTRAINT "agent_dispatches_sender_id_users_id_fk" FOREIGN KEY ("sender_id") REFERENCES "auth"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_dispatches" ADD CONSTRAINT "agent_dispatches_work_id_feedback_shares_id_fk" FOREIGN KEY ("work_id") REFERENCES "public"."feedback_shares"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_listeners" ADD CONSTRAINT "agent_listeners_connection_id_mcp_connections_id_fk" FOREIGN KEY ("connection_id") REFERENCES "public"."mcp_connections"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_listeners" ADD CONSTRAINT "agent_listeners_project_key_projects_public_key_fk" FOREIGN KEY ("project_key") REFERENCES "public"."projects"("public_key") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_listeners" ADD CONSTRAINT "agent_listeners_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "brain_rules" ADD CONSTRAINT "brain_rules_owner_user_id_users_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "auth"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "brain_rules" ADD CONSTRAINT "brain_rules_project_key_projects_public_key_fk" FOREIGN KEY ("project_key") REFERENCES "public"."projects"("public_key") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "brain_rules" ADD CONSTRAINT "brain_rules_author_user_id_users_id_fk" FOREIGN KEY ("author_user_id") REFERENCES "auth"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "next_step_comments" ADD CONSTRAINT "next_step_comments_next_step_id_next_steps_id_fk" FOREIGN KEY ("next_step_id") REFERENCES "public"."next_steps"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "next_step_comments" ADD CONSTRAINT "next_step_comments_comment_id_comments_id_fk" FOREIGN KEY ("comment_id") REFERENCES "public"."comments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "next_step_rule_citations" ADD CONSTRAINT "next_step_rule_citations_next_step_id_next_steps_id_fk" FOREIGN KEY ("next_step_id") REFERENCES "public"."next_steps"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "next_step_rule_citations" ADD CONSTRAINT "next_step_rule_citations_rule_id_brain_rules_id_fk" FOREIGN KEY ("rule_id") REFERENCES "public"."brain_rules"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "next_steps" ADD CONSTRAINT "next_steps_project_key_projects_public_key_fk" FOREIGN KEY ("project_key") REFERENCES "public"."projects"("public_key") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "next_steps" ADD CONSTRAINT "next_steps_conflict_rule_id_brain_rules_id_fk" FOREIGN KEY ("conflict_rule_id") REFERENCES "public"."brain_rules"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspaces" ADD CONSTRAINT "workspaces_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "agent_dispatches_retry" ON "agent_dispatches" USING btree ("sender_id","request_key");--> statement-breakpoint
CREATE UNIQUE INDEX "agent_dispatches_active_comment" ON "agent_dispatches" USING btree ("comment_id") WHERE "agent_dispatches"."state" in ('queued','received');--> statement-breakpoint
CREATE UNIQUE INDEX "agent_dispatches_work" ON "agent_dispatches" USING btree ("work_id");--> statement-breakpoint
CREATE INDEX "agent_dispatches_queue" ON "agent_dispatches" USING btree ("listener_id","created_at");--> statement-breakpoint
CREATE INDEX "agent_dispatches_project" ON "agent_dispatches" USING btree ("project_key","created_at");--> statement-breakpoint
CREATE INDEX "agent_listeners_project" ON "agent_listeners" USING btree ("project_key");--> statement-breakpoint
CREATE INDEX "agent_listeners_connection" ON "agent_listeners" USING btree ("connection_id");--> statement-breakpoint
CREATE INDEX "brain_rules_owner" ON "brain_rules" USING btree ("owner_user_id");--> statement-breakpoint
CREATE INDEX "brain_rules_project" ON "brain_rules" USING btree ("project_key");--> statement-breakpoint
CREATE INDEX "next_step_comments_comment" ON "next_step_comments" USING btree ("comment_id");--> statement-breakpoint
CREATE INDEX "next_step_rule_citations_rule" ON "next_step_rule_citations" USING btree ("rule_id");--> statement-breakpoint
CREATE INDEX "next_steps_project" ON "next_steps" USING btree ("project_key");--> statement-breakpoint
CREATE UNIQUE INDEX "next_steps_open_group" ON "next_steps" USING btree ("project_key","group_key") WHERE "next_steps"."status" <> 'done';
--> statement-breakpoint
CREATE FUNCTION public.project_activity(p_actor uuid, p_live_since timestamptz)
RETURNS TABLE(project_key text, open_count integer, agent_live boolean)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT m.project_key,
    (SELECT count(*)::integer FROM public.comments c WHERE c.project_id=m.project_key
      AND (m.role <> 'guest' OR c.visibility='shared')
      AND coalesce(c.status,'') NOT IN ('approved','accepted','rejected')
      AND coalesce(c.implementation_status,'') NOT IN ('done','ready_for_testing')),
    EXISTS (SELECT 1 FROM public.feedback_shares s JOIN public.agent_presence a ON a.share_id=s.id
      WHERE s.project_id=m.project_key AND s.revoked_at IS NULL AND s.expires_at > now() AND a.last_seen_at > p_live_since)
  FROM public.project_members m JOIN public.projects p ON p.public_key=m.project_key
  WHERE m.user_id=p_actor
    AND (NOT p.widget_private OR p.feedback_access='team' OR m.role='admin' OR m.is_owner);
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION public.project_activity(uuid, timestamptz) FROM PUBLIC, anon, authenticated;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.project_activity(uuid, timestamptz) TO service_role;
--> statement-breakpoint
NOTIFY pgrst, 'reload schema';
--> statement-breakpoint
CREATE FUNCTION public.brain_rules_for(p_actor uuid, p_project_key text)
RETURNS SETOF public.brain_rules
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT r.* FROM public.brain_rules r
  WHERE EXISTS (SELECT 1 FROM public.project_members m
    JOIN public.projects p ON p.public_key=m.project_key
    LEFT JOIN public.project_members o ON o.project_key=m.project_key AND o.is_owner
    WHERE m.user_id=p_actor AND (p_project_key IS NULL OR m.project_key=p_project_key)
      AND (NOT p.widget_private OR p.feedback_access='team' OR m.role='admin' OR m.is_owner)
      AND (r.project_key=m.project_key OR (r.project_key IS NULL AND r.owner_user_id=o.user_id)))
  ORDER BY r.project_key NULLS FIRST, r.created_at, r.id;
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION public.brain_rules_for(uuid, text) FROM PUBLIC, anon, authenticated;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.brain_rules_for(uuid, text) TO service_role;
--> statement-breakpoint
CREATE FUNCTION public.sync_next_steps(p_project text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended('crrt-next-steps:'||p_project,0));
  -- Comments no longer ready and not completed (reopened, rejected) leave their step.
  DELETE FROM public.next_step_comments l USING public.next_steps s, public.comments c
    WHERE s.id=l.next_step_id AND c.id=l.comment_id AND s.project_key=p_project AND s.status<>'done'
      AND (c.status IS DISTINCT FROM 'approved' OR c.visibility<>'shared')
      AND coalesce(c.implementation_status,'unassigned') NOT IN ('ready_for_testing','done');
  WITH ready AS (
    SELECT c.id, c.created_at, c.comment,
      split_part(split_part(coalesce(c.url,''),'#',1),'?',1) AS page,
      split_part(split_part(coalesce(c.url,''),'#',1),'?',1)||'|'||coalesce(c.element,'') AS group_key
    FROM public.comments c
    WHERE c.project_id=p_project AND c.status='approved' AND c.visibility='shared'
      AND coalesce(c.implementation_status,'unassigned') NOT IN ('ready_for_testing','done')
      AND NOT EXISTS (SELECT 1 FROM public.next_step_comments l JOIN public.next_steps s ON s.id=l.next_step_id
        WHERE l.comment_id=c.id AND s.status<>'done')
  ), created AS (
    INSERT INTO public.next_steps(project_key,group_key,title,tag)
    SELECT DISTINCT ON (group_key) p_project, group_key, left(btrim(coalesce(comment,'')),120),
      coalesce(nullif(regexp_replace(page,'^[A-Za-z][A-Za-z0-9+.-]*://[^/]*',''),''),'/')
    FROM ready ORDER BY group_key, created_at, id
    ON CONFLICT (project_key,group_key) WHERE status <> 'done' DO NOTHING
    RETURNING id, group_key
  ), steps AS (
    SELECT id, group_key FROM created
    UNION ALL SELECT id, group_key FROM public.next_steps WHERE project_key=p_project AND status<>'done'
  )
  INSERT INTO public.next_step_comments(next_step_id,comment_id)
  SELECT s.id, r.id FROM ready r JOIN steps s ON s.group_key=r.group_key
  ON CONFLICT DO NOTHING;
  DELETE FROM public.next_steps s WHERE s.project_key=p_project AND s.status<>'done'
    AND NOT EXISTS (SELECT 1 FROM public.next_step_comments l WHERE l.next_step_id=s.id);
  UPDATE public.next_steps s SET status='done', completed_at=now(), updated_at=now()
    WHERE s.project_key=p_project AND s.status<>'done'
      AND NOT EXISTS (SELECT 1 FROM public.next_step_comments l JOIN public.comments c ON c.id=l.comment_id
        WHERE l.next_step_id=s.id AND coalesce(c.implementation_status,'unassigned') NOT IN ('ready_for_testing','done'));
  RETURN coalesce((SELECT jsonb_agg(jsonb_build_object(
    'id',s.id,'title',s.title,'tag',s.tag,'status',s.status,'createdAt',s.created_at,
    'comments',(SELECT jsonb_agg(jsonb_build_object('id',c.id,'body',coalesce(c.comment,''),'authorName',nullif(c.author_name,'')) ORDER BY c.created_at,c.id)
      FROM public.next_step_comments l JOIN public.comments c ON c.id=l.comment_id WHERE l.next_step_id=s.id),
    'requesters',(SELECT coalesce(jsonb_agg(a.name ORDER BY a.first_at,a.name),'[]') FROM (
      SELECT c.author_name AS name, min(c.created_at) AS first_at FROM public.next_step_comments l JOIN public.comments c ON c.id=l.comment_id
      WHERE l.next_step_id=s.id AND c.author_name<>'' GROUP BY c.author_name) a),
    'citations',(SELECT coalesce(jsonb_agg(jsonb_build_object('ruleId',r.id,'title',r.title) ORDER BY t.created_at,r.id),'[]')
      FROM public.next_step_rule_citations t JOIN public.brain_rules r ON r.id=t.rule_id WHERE t.next_step_id=s.id),
    'conflict',CASE WHEN s.conflict_question IS NOT NULL THEN jsonb_build_object('ruleId',s.conflict_rule_id,'ruleTitle',cr.title,
      'question',s.conflict_question,'decision',s.conflict_decision) END
  ) ORDER BY s.created_at,(SELECT min(c.created_at) FROM public.next_step_comments l JOIN public.comments c ON c.id=l.comment_id
    WHERE l.next_step_id=s.id),s.id) FROM public.next_steps s LEFT JOIN public.brain_rules cr ON cr.id=s.conflict_rule_id
    WHERE s.project_key=p_project AND s.status<>'done'),'[]');
END;
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION public.sync_next_steps(text) FROM PUBLIC, anon, authenticated;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.sync_next_steps(text) TO service_role;
--> statement-breakpoint
CREATE FUNCTION public.agent_runs(p_projects text[], p_live_since timestamptz, p_limit integer)
RETURNS TABLE(share_id uuid, project_key text, agent_id text, started_at timestamptz, ended_at timestamptz,
  steps integer, comments_completed integer, outcome text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT r.share_id, r.project_key, r.agent_id, r.started_at, r.ended_at, r.steps, r.comments_completed,
    CASE WHEN r.live AND a.last_seen_at > p_live_since THEN 'running'
      WHEN r.last_event='comment.ready_for_testing' THEN 'completed'
      WHEN r.last_event='comment.blocked' THEN 'blocked' ELSE 'stopped' END
  FROM (
    SELECT s.id AS share_id, s.project_id AS project_key, e.actor_id AS agent_id,
      s.revoked_at IS NULL AND s.expires_at > now() AS live,
      min(e.created_at) AS started_at, max(e.created_at) AS ended_at,
      (count(*) FILTER (WHERE e.event_type LIKE 'comment.%'))::integer AS steps,
      (count(DISTINCT e.comment_id) FILTER (WHERE e.event_type='comment.ready_for_testing'))::integer AS comments_completed,
      (array_agg(e.event_type ORDER BY e.id DESC) FILTER (WHERE e.event_type LIKE 'comment.%'))[1] AS last_event
    FROM public.feedback_shares s JOIN public.feedback_events e ON e.share_id=s.id
    WHERE s.project_id = ANY(p_projects) AND e.actor_type='agent'
    GROUP BY s.id, e.actor_id
  ) r LEFT JOIN public.agent_presence a ON a.share_id=r.share_id AND a.agent_id=r.agent_id
  ORDER BY r.started_at DESC, r.share_id, r.agent_id
  LIMIT p_limit;
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION public.agent_runs(text[], timestamptz, integer) FROM PUBLIC, anon, authenticated;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.agent_runs(text[], timestamptz, integer) TO service_role;
--> statement-breakpoint
GRANT ALL ON public.agent_listeners, public.agent_dispatches TO service_role;
--> statement-breakpoint
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
CREATE FUNCTION public.agent_comment_fingerprint(c public.comments) RETURNS text
LANGUAGE sql IMMUTABLE SET search_path='' AS $$
  SELECT md5(jsonb_build_array(c.project_id,c.comment,c.url,c.element,c.x,c.y,c.target_type,c.anchor,c.image_url,c.screenshot_storage_path,c.visibility)::text)
$$;
--> statement-breakpoint
CREATE FUNCTION public.agent_listener_access(l public.agent_listeners) RETURNS void
LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
  PERFORM public.agent_dispatch_actor(l.project_key,l.user_id,'agent:operate');
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
CREATE FUNCTION public.agent_dispatch_send(p_actor uuid,p_project text,p_listener uuid,p_comment uuid,p_expected timestamptz,p_key uuid)
RETURNS jsonb LANGUAGE plpgsql SET search_path='' AS $$
DECLARE l public.agent_listeners; c public.comments; d public.agent_dispatches; fingerprint text;
BEGIN
  PERFORM public.agent_dispatch_actor(p_project,p_actor,'feedback:manage');
  PERFORM public.cloud_validate_write(public.cloud_owner(p_project));
  PERFORM pg_advisory_xact_lock(hashtextextended('send:'||p_actor::text||':'||p_key::text,0));
  SELECT * INTO l FROM public.agent_listeners WHERE id=p_listener AND project_key=p_project FOR UPDATE;
  IF NOT FOUND OR NOT p_actor=ANY(l.sender_ids) THEN RAISE EXCEPTION 'forbidden'; END IF;
  PERFORM public.agent_listener_access(l);
  fingerprint:=md5(jsonb_build_array(p_project,p_listener,p_comment,p_expected)::text);
  -- A retry with the same key gets the first answer, even once the listener is offline.
  SELECT * INTO d FROM public.agent_dispatches WHERE sender_id=p_actor AND request_key=p_key;
  IF FOUND THEN
    IF d.request_hash<>fingerprint THEN RAISE EXCEPTION 'idempotency_conflict'; END IF;
    RETURN jsonb_build_object('dispatchId',d.id,'state',d.state);
  END IF;
  IF l.stopped OR l.heartbeat_at<clock_timestamp()-interval '60 seconds' THEN RAISE EXCEPTION 'listener_offline'; END IF;
  SELECT * INTO c FROM public.comments WHERE id=p_comment AND project_id=p_project FOR UPDATE;
  IF NOT FOUND OR c.updated_at IS DISTINCT FROM p_expected THEN RAISE EXCEPTION 'feedback_changed'; END IF;
  IF EXISTS(SELECT 1 FROM public.agent_dispatches WHERE comment_id=c.id AND state IN ('queued','received')) THEN RAISE EXCEPTION 'already_sent'; END IF;
  IF c.status NOT IN ('pending','approved') OR coalesce(c.implementation_status,'unassigned')<>'unassigned' OR c.claimed_by_agent_id IS NOT NULL THEN RAISE EXCEPTION 'feedback_not_eligible'; END IF;
  -- Sending is the authenticated human review decision, never model inference.
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
  PERFORM public.agent_dispatch_actor(d.project_key,d.sender_id,'feedback:manage');
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
REVOKE ALL ON FUNCTION public.agent_dispatch_actor(text,uuid,text), public.agent_comment_fingerprint(public.comments), public.agent_listener_access(public.agent_listeners), public.agent_listener_register(uuid,uuid,uuid,text,text,text,uuid[]), public.agent_dispatch_send(uuid,text,uuid,uuid,timestamptz,uuid), public.agent_dispatch_validate(public.agent_dispatches,public.agent_listeners), public.agent_listener_poll(uuid,uuid,uuid,jsonb), public.agent_listener_stop(uuid,uuid,uuid), public.agent_dispatch_guard(uuid,uuid,uuid,text), public.agent_dispatch_progress() FROM PUBLIC,anon,authenticated;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.agent_dispatch_actor(text,uuid,text), public.agent_comment_fingerprint(public.comments), public.agent_listener_access(public.agent_listeners), public.agent_listener_register(uuid,uuid,uuid,text,text,text,uuid[]), public.agent_dispatch_send(uuid,text,uuid,uuid,timestamptz,uuid), public.agent_dispatch_validate(public.agent_dispatches,public.agent_listeners), public.agent_listener_poll(uuid,uuid,uuid,jsonb), public.agent_listener_stop(uuid,uuid,uuid), public.agent_dispatch_guard(uuid,uuid,uuid,text), public.agent_dispatch_progress() TO service_role;
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
CREATE FUNCTION public.delete_owned_project(p_project text, p_actor uuid)
RETURNS text LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  PERFORM 1 FROM public.projects p WHERE p.public_key=p_project FOR UPDATE;
  IF NOT FOUND THEN RETURN 'not_found'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.project_members m WHERE m.project_key=p_project AND m.user_id=p_actor AND m.is_owner) THEN
    RETURN 'forbidden';
  END IF;
  INSERT INTO public.extension_image_cleanup_jobs(storage_path)
    SELECT c.screenshot_storage_path FROM public.comments c
    WHERE c.project_id=p_project AND c.source<>'extension' AND c.screenshot_storage_path IS NOT NULL
  ON CONFLICT (storage_path) DO NOTHING;
  DELETE FROM public.comments c WHERE c.project_id=p_project;
  DELETE FROM public.notifications n WHERE n.payload->>'projectKey'=p_project;
  DELETE FROM public.projects p WHERE p.public_key=p_project;
  RETURN 'deleted';
END;
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION public.delete_owned_project(text, uuid) FROM PUBLIC, anon, authenticated;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.delete_owned_project(text, uuid) TO service_role;
--> statement-breakpoint
NOTIFY pgrst, 'reload schema';
