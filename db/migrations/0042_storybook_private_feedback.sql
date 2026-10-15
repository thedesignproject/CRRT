CREATE TABLE "storybook_connections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_key" text NOT NULL,
	"created_by" uuid NOT NULL,
	"code_hash" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"claimed_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	"client" jsonb,
	CONSTRAINT "storybook_connections_code_hash_unique" UNIQUE("code_hash"),
	CONSTRAINT "storybook_connections_code_hash_check" CHECK ("storybook_connections"."code_hash" ~ '^[0-9a-f]{64}$'),
	CONSTRAINT "storybook_connections_lifetime_check" CHECK ("storybook_connections"."expires_at" > "storybook_connections"."created_at" and "storybook_connections"."expires_at" <= "storybook_connections"."created_at" + interval '5 minutes')
);
--> statement-breakpoint
ALTER TABLE "storybook_connections" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "widget_auth_sessions" ADD COLUMN "storybook_connection_id" uuid;--> statement-breakpoint
ALTER TABLE "storybook_connections" ADD CONSTRAINT "storybook_connections_project_key_projects_public_key_fk" FOREIGN KEY ("project_key") REFERENCES "public"."projects"("public_key") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "storybook_connections" ADD CONSTRAINT "storybook_connections_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "storybook_connections_project_idx" ON "storybook_connections" USING btree ("project_key");--> statement-breakpoint
ALTER TABLE "widget_auth_sessions" ADD CONSTRAINT "widget_auth_sessions_storybook_connection_id_storybook_connections_id_fk" FOREIGN KEY ("storybook_connection_id") REFERENCES "public"."storybook_connections"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE FUNCTION public.claim_storybook_pairing(p_hash text, p_client jsonb)
RETURNS SETOF public.storybook_connections LANGUAGE plpgsql SET search_path = '' AS $$
DECLARE v_row public.storybook_connections%ROWTYPE;
BEGIN
  SELECT * INTO v_row FROM public.storybook_connections WHERE code_hash=p_hash;
  IF NOT FOUND THEN RAISE EXCEPTION 'invalid_pairing'; END IF;
  PERFORM public.lock_feedback_actor(v_row.project_key,v_row.created_by,'feedback:read');
  IF NOT EXISTS (SELECT 1 FROM public.project_members WHERE project_key=v_row.project_key AND user_id=v_row.created_by AND is_owner) THEN
    RAISE EXCEPTION 'access_denied';
  END IF;
  SELECT * INTO v_row FROM public.storybook_connections WHERE code_hash=p_hash FOR UPDATE;
  IF v_row.expires_at <= clock_timestamp() OR v_row.revoked_at IS NOT NULL THEN RAISE EXCEPTION 'invalid_pairing'; END IF;
  IF v_row.claimed_at IS NULL THEN
    UPDATE public.storybook_connections SET claimed_at=clock_timestamp(),client=p_client WHERE id=v_row.id RETURNING * INTO v_row;
  END IF;
  RETURN NEXT v_row;
END;
$$;
--> statement-breakpoint
CREATE FUNCTION public.create_storybook_comment(p_connection uuid,p_actor uuid,p_origin text,p_token_hash text,p_comment jsonb)
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
  INSERT INTO public.comments(project_id,source,visibility,url,x,y,element,comment,status,implementation_status,created_by,created_by_user_id,author_name)
  VALUES(v_project,'widget','shared',p_comment->>'pageUrl',(p_comment->>'x')::float8,(p_comment->>'y')::float8,
    p_comment->>'selector',p_comment->>'body','pending','unassigned','public',p_actor,p_comment->>'authorName') RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION public.claim_storybook_pairing(text,jsonb), public.create_storybook_comment(uuid,uuid,text,text,jsonb) FROM PUBLIC,anon,authenticated;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.claim_storybook_pairing(text,jsonb), public.create_storybook_comment(uuid,uuid,text,text,jsonb) TO service_role;
--> statement-breakpoint
NOTIFY pgrst, 'reload schema';
--> statement-breakpoint
CREATE FUNCTION public.create_storybook_comment_snapshot(p_connection uuid,p_actor uuid,p_origin text,p_token_hash text,p_comment jsonb)
RETURNS SETOF public.comments LANGUAGE plpgsql SET search_path = '' AS $$
DECLARE v_project text; v_origins text[]; v_hostname text; v_id uuid;
BEGIN
  SELECT project_key INTO v_project FROM public.storybook_connections WHERE id=p_connection;
  PERFORM public.lock_feedback_actor(v_project,p_actor,'feedback:read');
  SELECT allowed_origins INTO v_origins FROM public.projects WHERE public_key=v_project;
  -- The session stores a canonical origin. Parse its host without losing IPv6
  -- brackets; domain matching uses the same exact/subdomain rule as origins.ts.
  v_hostname := (regexp_match(p_origin,'^https?://(\[[^]]+\]|[^/:?#]+)(:[0-9]+)?$'))[1];
  IF v_hostname IS NULL OR NOT (cardinality(v_origins)=0 OR EXISTS (
    SELECT 1 FROM unnest(v_origins) d WHERE v_hostname=d OR right(v_hostname,length(d)+1)='.' || d
  )) THEN RAISE EXCEPTION 'access_denied'; END IF;
  v_id := public.create_storybook_comment(p_connection,p_actor,p_origin,p_token_hash,p_comment);
  -- Return the insertion snapshot while the row is still private to this
  -- transaction; never reload it after another actor can make it internal.
  RETURN QUERY SELECT c.* FROM public.comments c WHERE c.id=v_id;
END;
$$;
--> statement-breakpoint
CREATE FUNCTION public.manage_storybook_connections(p_project text,p_actor uuid,p_connection uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SET search_path = '' AS $$
DECLARE v_id uuid; v_connections jsonb;
BEGIN
  -- Ownership transfers/removals take the project's UPDATE lock. Hold SHARE
  -- from authorization through the read or mutation, preserving that order.
  PERFORM public.lock_feedback_actor(p_project,p_actor,'feedback:read');
  IF NOT EXISTS (SELECT 1 FROM public.project_members WHERE project_key=p_project AND user_id=p_actor AND is_owner) THEN
    RAISE EXCEPTION 'access_denied';
  END IF;
  IF p_connection IS NULL THEN
    SELECT coalesce(jsonb_agg(entry.value ORDER BY entry.created_at DESC,entry.id DESC),'[]'::jsonb) INTO v_connections FROM (
      SELECT c.id,c.created_at,jsonb_build_object('id',c.id,'project_key',c.project_key,'created_by',c.created_by,
        'expires_at',c.expires_at,'claimed_at',c.claimed_at,'revoked_at',c.revoked_at) AS value
      FROM public.storybook_connections c WHERE c.project_key=p_project ORDER BY c.created_at DESC,c.id DESC LIMIT 50
    ) entry;
    RETURN jsonb_build_object('connections',v_connections);
  END IF;
  UPDATE public.storybook_connections SET revoked_at=clock_timestamp() WHERE id=p_connection AND project_key=p_project RETURNING id INTO v_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'access_denied'; END IF;
  RETURN jsonb_build_object('revoked',true);
END;
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION public.create_storybook_comment_snapshot(uuid,uuid,text,text,jsonb), public.manage_storybook_connections(text,uuid,uuid) FROM PUBLIC,anon,authenticated;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.create_storybook_comment_snapshot(uuid,uuid,text,text,jsonb), public.manage_storybook_connections(text,uuid,uuid) TO service_role;
--> statement-breakpoint
NOTIFY pgrst, 'reload schema';
