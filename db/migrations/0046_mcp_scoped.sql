CREATE TABLE "mcp_clients" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"redirect_uris" text[] NOT NULL,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "mcp_clients_redirects" CHECK (cardinality("mcp_clients"."redirect_uris") between 1 and 5)
);
--> statement-breakpoint
ALTER TABLE "mcp_clients" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "mcp_codes" (
	"hash" text PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"client_id" uuid NOT NULL,
	"redirect_uri" text NOT NULL,
	"challenge" text NOT NULL,
	"state_hash" text NOT NULL,
	"scope" text DEFAULT 'crrt:read' NOT NULL,
	"resource" text NOT NULL,
	"consumed_at" timestamp with time zone,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "mcp_codes_hash" CHECK ("mcp_codes"."hash" ~ '^[0-9a-f]{64}$' and "mcp_codes"."state_hash" ~ '^[0-9a-f]{64}$'),
	CONSTRAINT "mcp_codes_scope" CHECK ("mcp_codes"."scope" in ('crrt:read','crrt:read crrt:implement','crrt:read crrt:review','crrt:read crrt:implement crrt:review')),
	CONSTRAINT "mcp_codes_challenge" CHECK ("mcp_codes"."challenge" ~ '^[A-Za-z0-9_-]{43}$'),
	CONSTRAINT "mcp_codes_lifetime" CHECK ("mcp_codes"."expires_at" > "mcp_codes"."created_at" and "mcp_codes"."expires_at" <= "mcp_codes"."created_at" + interval '5 minutes')
);
--> statement-breakpoint
ALTER TABLE "mcp_codes" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "mcp_connections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"client_id" uuid NOT NULL,
	"resource" text NOT NULL,
	"scope" text DEFAULT 'crrt:read' NOT NULL,
	"revoked_at" timestamp with time zone,
	"expires_at" timestamp with time zone DEFAULT now() + interval '30 days' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "mcp_connections_scope" CHECK ("mcp_connections"."scope" in ('crrt:read','crrt:read crrt:implement','crrt:read crrt:review','crrt:read crrt:implement crrt:review')),
	CONSTRAINT "mcp_connections_lifetime" CHECK ("mcp_connections"."expires_at" > "mcp_connections"."created_at" and "mcp_connections"."expires_at" <= "mcp_connections"."created_at" + interval '30 days')
);
--> statement-breakpoint
ALTER TABLE "mcp_connections" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "mcp_credentials" (
	"hash" text PRIMARY KEY NOT NULL,
	"connection_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"consumed_at" timestamp with time zone,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "mcp_credentials_hash" CHECK ("mcp_credentials"."hash" ~ '^[0-9a-f]{64}$'),
	CONSTRAINT "mcp_credentials_kind" CHECK ("mcp_credentials"."kind" in ('access', 'refresh')),
	CONSTRAINT "mcp_credentials_lifetime" CHECK ("mcp_credentials"."expires_at" > "mcp_credentials"."created_at" and "mcp_credentials"."expires_at" <= "mcp_credentials"."created_at" + case when "mcp_credentials"."kind" = 'access' then interval '15 minutes' else interval '30 days' end)
);
--> statement-breakpoint
ALTER TABLE "mcp_credentials" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "mcp_limits" (
	"key" text PRIMARY KEY NOT NULL,
	"window_start" timestamp with time zone NOT NULL,
	"attempts" integer NOT NULL
);
--> statement-breakpoint
ALTER TABLE "mcp_limits" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "mcp_workflows" (
	"share_id" uuid PRIMARY KEY NOT NULL,
	"connection_id" uuid NOT NULL,
	"request_key" text NOT NULL,
	"request_hash" text NOT NULL,
	"prompt_version" text DEFAULT '1' NOT NULL,
	CONSTRAINT "mcp_workflow_shape" CHECK ("mcp_workflows"."request_key" ~ '^[A-Za-z0-9_-]{16,128}$' and "mcp_workflows"."request_hash" ~ '^[0-9a-f]{64}$' and "mcp_workflows"."prompt_version"='1')
);
--> statement-breakpoint
ALTER TABLE "mcp_workflows" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "mcp_codes" ADD CONSTRAINT "mcp_codes_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mcp_codes" ADD CONSTRAINT "mcp_codes_client_id_mcp_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."mcp_clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mcp_connections" ADD CONSTRAINT "mcp_connections_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mcp_connections" ADD CONSTRAINT "mcp_connections_client_id_mcp_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."mcp_clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mcp_credentials" ADD CONSTRAINT "mcp_credentials_connection_id_mcp_connections_id_fk" FOREIGN KEY ("connection_id") REFERENCES "public"."mcp_connections"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mcp_workflows" ADD CONSTRAINT "mcp_workflows_share_id_feedback_shares_id_fk" FOREIGN KEY ("share_id") REFERENCES "public"."feedback_shares"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mcp_workflows" ADD CONSTRAINT "mcp_workflows_connection_id_mcp_connections_id_fk" FOREIGN KEY ("connection_id") REFERENCES "public"."mcp_connections"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "mcp_codes_expiry" ON "mcp_codes" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "mcp_connections_user" ON "mcp_connections" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "mcp_credentials_connection" ON "mcp_credentials" USING btree ("connection_id");--> statement-breakpoint
CREATE UNIQUE INDEX "mcp_workflow_request" ON "mcp_workflows" USING btree ("connection_id","request_key");
--> statement-breakpoint

CREATE INDEX mcp_feedback_page ON public.comments(project_id, created_at DESC, id DESC);
--> statement-breakpoint
CREATE FUNCTION public.mcp_exchange(p_hash text,p_client uuid,p_redirect text,p_challenge text,p_resource text,p_access text,p_refresh text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE code public.mcp_codes; connection uuid;
BEGIN
  SELECT c.* INTO code FROM public.mcp_codes c JOIN public.mcp_clients cl ON cl.id=c.client_id
    JOIN auth.users u ON u.id=c.user_id
    WHERE c.hash=p_hash AND c.client_id=p_client AND c.redirect_uri=p_redirect AND c.challenge=p_challenge
    AND c.resource=p_resource AND c.expires_at>clock_timestamp() AND c.consumed_at IS NULL
    AND cl.revoked_at IS NULL AND c.redirect_uri=ANY(cl.redirect_uris)
    AND u.deleted_at IS NULL AND (u.banned_until IS NULL OR u.banned_until<now())
    FOR UPDATE OF c;
  IF NOT FOUND THEN RETURN NULL; END IF;
  UPDATE public.mcp_codes SET consumed_at=clock_timestamp() WHERE hash=p_hash;
  INSERT INTO public.mcp_connections(user_id,client_id,resource,scope) VALUES(code.user_id,p_client,p_resource,code.scope) RETURNING id INTO connection;
  INSERT INTO public.mcp_credentials(hash,connection_id,kind,expires_at) VALUES
    (p_access,connection,'access',now()+interval '15 minutes'),(p_refresh,connection,'refresh',now()+interval '30 days');
  RETURN connection;
END;
$$;
--> statement-breakpoint
CREATE FUNCTION public.mcp_refresh(p_hash text,p_client uuid,p_resource text,p_access text,p_refresh text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE token public.mcp_credentials; connection public.mcp_connections;
BEGIN
  SELECT c.* INTO connection FROM public.mcp_connections c JOIN public.mcp_credentials t ON t.connection_id=c.id
    JOIN public.mcp_clients cl ON cl.id=c.client_id JOIN auth.users u ON u.id=c.user_id
    WHERE t.hash=p_hash AND t.kind='refresh' AND c.client_id=p_client AND c.resource=p_resource
    AND c.revoked_at IS NULL AND c.expires_at>clock_timestamp() AND cl.revoked_at IS NULL
    AND u.deleted_at IS NULL AND (u.banned_until IS NULL OR u.banned_until<now()) FOR UPDATE OF c;
  IF NOT FOUND THEN RETURN NULL; END IF;
  SELECT * INTO token FROM public.mcp_credentials WHERE hash=p_hash;
  IF token.consumed_at IS NOT NULL THEN
    UPDATE public.mcp_connections SET revoked_at=clock_timestamp() WHERE id=connection.id;
    RETURN NULL;
  END IF;
  IF token.expires_at<=clock_timestamp() THEN RETURN NULL; END IF;
  UPDATE public.mcp_credentials SET consumed_at=clock_timestamp() WHERE hash=p_hash;
  INSERT INTO public.mcp_credentials(hash,connection_id,kind,expires_at) VALUES
    (p_access,connection.id,'access',least(now()+interval '15 minutes',connection.expires_at)),
    (p_refresh,connection.id,'refresh',connection.expires_at);
  RETURN connection.id;
END;
$$;
--> statement-breakpoint
CREATE FUNCTION public.mcp_identity(p_hash text,p_resource text)
RETURNS TABLE(user_id uuid,email text,connection_id uuid,scope text) LANGUAGE sql SECURITY DEFINER SET search_path='' AS $$
  SELECT c.user_id,u.email::text,c.id,c.scope FROM public.mcp_credentials t
  JOIN public.mcp_connections c ON c.id=t.connection_id JOIN public.mcp_clients cl ON cl.id=c.client_id
  JOIN auth.users u ON u.id=c.user_id WHERE t.hash=p_hash AND t.kind='access'
  AND t.expires_at>clock_timestamp() AND c.expires_at>clock_timestamp() AND c.revoked_at IS NULL
  AND cl.revoked_at IS NULL AND c.resource=p_resource
  AND u.deleted_at IS NULL AND u.email IS NOT NULL AND (u.banned_until IS NULL OR u.banned_until<now());
$$;
--> statement-breakpoint
CREATE FUNCTION public.mcp_revoke(p_hash text,p_client uuid)
RETURNS void LANGUAGE sql SET search_path='' AS $$
  UPDATE public.mcp_connections SET revoked_at=clock_timestamp() WHERE client_id=p_client AND id IN
    (SELECT connection_id FROM public.mcp_credentials WHERE hash=p_hash);
$$;
--> statement-breakpoint
CREATE FUNCTION public.mcp_reserve(p_key text,p_limit integer)
RETURNS boolean LANGUAGE plpgsql SET search_path='' AS $$
DECLARE reserved integer;
BEGIN
  INSERT INTO public.mcp_limits(key,window_start,attempts) VALUES(p_key,date_trunc('minute',clock_timestamp()),1)
  ON CONFLICT(key) DO UPDATE SET
    attempts=CASE WHEN mcp_limits.window_start<date_trunc('minute',clock_timestamp()) THEN 1 ELSE mcp_limits.attempts+1 END,
    window_start=date_trunc('minute',clock_timestamp()) RETURNING attempts INTO reserved;
  RETURN reserved<=p_limit;
END;
$$;
--> statement-breakpoint
CREATE FUNCTION public.mcp_cleanup() RETURNS void LANGUAGE sql SET search_path='' AS $$
  DELETE FROM public.mcp_codes WHERE expires_at<now()-interval '1 day';
  DELETE FROM public.mcp_connections WHERE expires_at<now()-interval '1 day';
  DELETE FROM public.mcp_credentials WHERE kind='access' AND expires_at<now()-interval '1 day';
  DELETE FROM public.mcp_limits WHERE window_start<now()-interval '1 day';
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION public.mcp_exchange(text,uuid,text,text,text,text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.mcp_exchange(text,uuid,text,text,text,text,text) TO service_role;
--> statement-breakpoint
REVOKE ALL ON FUNCTION public.mcp_refresh(text,uuid,text,text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.mcp_refresh(text,uuid,text,text,text) TO service_role;
--> statement-breakpoint
REVOKE ALL ON FUNCTION public.mcp_identity(text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.mcp_identity(text,text) TO service_role;
--> statement-breakpoint
REVOKE ALL ON FUNCTION public.mcp_revoke(text,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.mcp_revoke(text,uuid) TO service_role;
--> statement-breakpoint
REVOKE ALL ON FUNCTION public.mcp_reserve(text,integer) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.mcp_reserve(text,integer) TO service_role;
--> statement-breakpoint
REVOKE ALL ON FUNCTION public.mcp_cleanup() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.mcp_cleanup() TO service_role;
--> statement-breakpoint
GRANT ALL ON public.mcp_clients,public.mcp_codes,public.mcp_connections,public.mcp_credentials,public.mcp_limits,public.mcp_workflows TO service_role;
--> statement-breakpoint
NOTIFY pgrst,'reload schema';
--> statement-breakpoint
CREATE OR REPLACE FUNCTION public.create_actor_share(p_project text, p_actor uuid, p_share jsonb, p_comments uuid[])
RETURNS SETOF public.feedback_shares LANGUAGE plpgsql SET search_path = '' AS $$
DECLARE v_ids uuid[]; v_share public.feedback_shares%ROWTYPE;
BEGIN
  PERFORM public.lock_feedback_actor(p_project,p_actor,'agent:operate');
  IF p_share ? 'mcp_connection' THEN PERFORM public.mcp_require_connection((p_share->>'mcp_connection')::uuid,p_actor,'crrt:implement'); END IF;
  IF p_share->>'scope_type' NOT IN ('page','selection') OR (p_share->>'scope_type'='page' AND nullif(p_share->>'scope_page_url','') IS NULL) THEN RAISE EXCEPTION 'invalid_share_scope'; END IF;
  SELECT array_agg(eligible.id) INTO v_ids FROM (
    SELECT c.id FROM public.comments c WHERE c.id=ANY(p_comments) AND c.project_id=p_project AND (c.visibility='shared' OR p_share ? 'mcp_connection') AND c.status='approved'
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
CREATE OR REPLACE FUNCTION public.guard_share_comment_event()
RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $$
DECLARE v_share public.feedback_shares%ROWTYPE; v_project text; v_private boolean;
BEGIN
  IF NEW.comment_id IS NULL THEN RETURN NEW; END IF;
  SELECT s.project_id INTO v_project FROM public.feedback_shares s WHERE s.id=NEW.share_id;
  SELECT p.widget_private INTO v_private FROM public.projects p WHERE p.public_key=v_project FOR SHARE;
  SELECT s.* INTO v_share FROM public.feedback_shares s WHERE s.id=NEW.share_id FOR SHARE;
  IF NOT FOUND OR v_share.revoked_at IS NOT NULL OR v_share.expires_at<=clock_timestamp()
    OR (v_share.created_by='system' AND v_private) THEN RETURN NULL; END IF;
  PERFORM 1 FROM public.comments c WHERE c.id=NEW.comment_id AND c.project_id=v_project AND (c.visibility='shared' OR EXISTS (SELECT 1 FROM public.mcp_workflows w JOIN public.mcp_connections mc ON mc.id=w.connection_id WHERE w.share_id=NEW.share_id AND mc.revoked_at IS NULL AND mc.expires_at>clock_timestamp())) AND (c.status='approved' OR (NEW.actor_type='reviewer' AND NEW.event_type IN ('comment.reviewed','comment.implementation_changed')))
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
CREATE FUNCTION public.mcp_require_connection(p_connection uuid,p_actor uuid,p_scope text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
  PERFORM 1 FROM public.mcp_connections c JOIN public.mcp_clients cl ON cl.id=c.client_id JOIN auth.users u ON u.id=c.user_id
    WHERE c.id=p_connection AND c.user_id=p_actor AND c.revoked_at IS NULL AND c.expires_at>clock_timestamp()
    AND cl.revoked_at IS NULL AND p_scope=ANY(string_to_array(c.scope,' '))
    AND u.deleted_at IS NULL AND (u.banned_until IS NULL OR u.banned_until<now()) FOR SHARE OF c;
  IF NOT FOUND THEN RAISE EXCEPTION 'insufficient_scope'; END IF;
END;
$$;
--> statement-breakpoint
CREATE FUNCTION public.mcp_prepare_work(p_connection uuid,p_actor uuid,p_project text,p_ids uuid[],p_key text,p_request_hash text,p_share jsonb)
RETURNS uuid LANGUAGE plpgsql SET search_path='' AS $$
DECLARE work public.mcp_workflows; item public.feedback_shares; eligible uuid[];
BEGIN
  PERFORM public.lock_feedback_actor(p_project,p_actor,'agent:operate');
  PERFORM public.mcp_require_connection(p_connection,p_actor,'crrt:implement');
  PERFORM public.cloud_validate_write(public.cloud_owner(p_project));
  IF cardinality(p_ids) IS NULL OR cardinality(p_ids)<1 OR cardinality(p_ids)>20 OR p_key !~ '^[A-Za-z0-9_-]{16,128}$'
    OR p_request_hash !~ '^[0-9a-f]{64}$' THEN RAISE EXCEPTION 'invalid_work_request'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('crrt-mcp-work:'||p_connection::text||':'||p_key,0));
  SELECT * INTO work FROM public.mcp_workflows WHERE connection_id=p_connection AND request_key=p_key;
  IF FOUND THEN
    IF work.request_hash IS DISTINCT FROM p_request_hash THEN RAISE EXCEPTION 'idempotency_conflict'; END IF;
    SELECT * INTO item FROM public.feedback_shares WHERE id=work.share_id AND revoked_at IS NULL AND expires_at>clock_timestamp();
    IF NOT FOUND THEN RAISE EXCEPTION 'work_unavailable'; END IF;
    RETURN work.share_id;
  END IF;
  SELECT array_agg(c.id ORDER BY c.id) INTO eligible FROM (
    SELECT id FROM public.comments WHERE project_id=p_project AND id=ANY(p_ids) AND status='approved'
      AND coalesce(implementation_status,'unassigned') NOT IN ('ready_for_testing','done') ORDER BY id FOR UPDATE
  ) c;
  IF cardinality(eligible) IS DISTINCT FROM cardinality(p_ids) THEN RAISE EXCEPTION 'feedback_not_eligible'; END IF;
  SELECT * INTO item FROM public.create_actor_share(p_project,p_actor,p_share||jsonb_build_object('mcp_connection',p_connection),p_ids);
  INSERT INTO public.mcp_workflows(share_id,connection_id,request_key,request_hash) VALUES(item.id,p_connection,p_key,p_request_hash);
  RETURN item.id;
END;
$$;
--> statement-breakpoint
CREATE FUNCTION public.mcp_work_operation(p_connection uuid,p_actor uuid,p_work uuid,p_agent text,p_comment uuid,p_op text,p_key text,p_summary text,p_request_hash text)
RETURNS jsonb LANGUAGE plpgsql SET search_path='' AS $$
DECLARE item public.feedback_shares; feedback public.comments; agent text; target text; event text; result record; old_hash text;
BEGIN
  SELECT s.* INTO item FROM public.mcp_workflows w JOIN public.feedback_shares s ON s.id=w.share_id
    WHERE w.share_id=p_work AND w.connection_id=p_connection;
  IF NOT FOUND THEN RAISE EXCEPTION 'work_unavailable'; END IF;
  PERFORM public.lock_feedback_actor(item.project_id,p_actor,'agent:operate');
  PERFORM public.mcp_require_connection(p_connection,p_actor,'crrt:implement');
  PERFORM public.cloud_validate_write(public.cloud_owner(item.project_id));
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
CREATE FUNCTION public.mcp_set_feedback_status(p_connection uuid,p_actor uuid,p_project text,p_comment uuid,p_expected text,p_review text,p_implementation text,p_reason text)
RETURNS jsonb LANGUAGE plpgsql SET search_path='' AS $$
DECLARE feedback public.comments; patch jsonb:='{}'; share_id uuid; review_status text;
BEGIN
  PERFORM public.lock_feedback_actor(p_project,p_actor,'feedback:manage');
  PERFORM public.mcp_require_connection(p_connection,p_actor,'crrt:review');
  PERFORM pg_advisory_xact_lock(hashtextextended('crrt-github-issue:'||p_project,0));
  SELECT * INTO feedback FROM public.comments WHERE id=p_comment AND project_id=p_project FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'feedback_not_found'; END IF;
  IF feedback.updated_at IS DISTINCT FROM p_expected::timestamptz THEN RAISE EXCEPTION 'status_conflict'; END IF;
  IF p_reason IS NULL OR btrim(p_reason)='' OR length(p_reason)>1000 OR (p_review IS NULL AND p_implementation IS NULL) THEN RAISE EXCEPTION 'invalid_status_request'; END IF;
  IF p_review IS NOT NULL THEN
    IF p_review NOT IN ('pending','approved','rejected') THEN RAISE EXCEPTION 'invalid_review_status'; END IF;
    patch:=patch||jsonb_build_object('status',p_review);
    IF p_review<>'approved' THEN patch:=patch||jsonb_build_object('implementation_status','unassigned','claimed_by_agent_id',NULL); END IF;
  END IF;
  IF p_implementation IS NOT NULL THEN
    IF p_implementation NOT IN ('unassigned','ready_for_testing','done') THEN RAISE EXCEPTION 'invalid_implementation_status'; END IF;
    patch:=patch||jsonb_build_object('implementation_status',p_implementation,'claimed_by_agent_id',NULL);
  END IF;
  SELECT * INTO feedback FROM public.mutate_actor_feedback(p_project,p_actor,p_comment,patch);
  -- Activity is part of the status transaction. A publication error rolls back
  -- the mutation too, preserving expectedUpdatedAt for a safe identical retry.
  review_status:=CASE feedback.status WHEN 'approved' THEN 'accepted' WHEN 'rejected' THEN 'rejected' ELSE 'open' END;
  FOR share_id IN
    SELECT s.id FROM public.feedback_shares s JOIN public.feedback_share_items i ON i.share_id=s.id
    WHERE i.comment_id=p_comment AND s.project_id=p_project AND s.revoked_at IS NULL AND s.expires_at>clock_timestamp()
    ORDER BY s.id FOR SHARE OF s
  LOOP
    -- Reuse the existing event store and its current selection/privacy guard.
    INSERT INTO public.feedback_events(share_id,comment_id,actor_type,actor_id,event_type,payload) VALUES
      (share_id,p_comment,'reviewer',p_actor::text,'comment.reviewed',jsonb_build_object('reviewStatus',review_status,'reason',p_reason)),
      (share_id,p_comment,'reviewer',p_actor::text,'comment.implementation_changed',jsonb_build_object('implementationStatus',feedback.implementation_status,'reason',p_reason));
  END LOOP;
  RETURN jsonb_build_object('projectId',p_project,'feedbackId',p_comment,'reviewStatus',review_status,'implementationStatus',feedback.implementation_status,'updatedAt',feedback.updated_at);
END;
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION public.mcp_require_connection(uuid,uuid,text), public.mcp_prepare_work(uuid,uuid,text,uuid[],text,text,jsonb), public.mcp_work_operation(uuid,uuid,uuid,text,uuid,text,text,text,text), public.mcp_set_feedback_status(uuid,uuid,text,uuid,text,text,text,text) FROM PUBLIC,anon,authenticated;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.mcp_require_connection(uuid,uuid,text), public.mcp_prepare_work(uuid,uuid,text,uuid[],text,text,jsonb), public.mcp_work_operation(uuid,uuid,uuid,text,uuid,text,text,text,text), public.mcp_set_feedback_status(uuid,uuid,text,uuid,text,text,text,text) TO service_role;
