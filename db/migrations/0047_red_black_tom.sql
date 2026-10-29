ALTER TABLE "mcp_codes" DROP CONSTRAINT "mcp_codes_scope";--> statement-breakpoint
ALTER TABLE "mcp_connections" DROP CONSTRAINT "mcp_connections_scope";--> statement-breakpoint
ALTER TABLE "mcp_codes" ADD CONSTRAINT "mcp_codes_scope" CHECK ("mcp_codes"."scope" in ('crrt:read','crrt:read crrt:implement','crrt:read crrt:review','crrt:read crrt:implement crrt:review','crrt:read crrt:projects','crrt:read crrt:implement crrt:projects','crrt:read crrt:review crrt:projects','crrt:read crrt:implement crrt:review crrt:projects'));--> statement-breakpoint
ALTER TABLE "mcp_connections" ADD CONSTRAINT "mcp_connections_scope" CHECK ("mcp_connections"."scope" in ('crrt:read','crrt:read crrt:implement','crrt:read crrt:review','crrt:read crrt:implement crrt:review','crrt:read crrt:projects','crrt:read crrt:implement crrt:projects','crrt:read crrt:review crrt:projects','crrt:read crrt:implement crrt:review crrt:projects'));
--> statement-breakpoint

CREATE FUNCTION public.mcp_create_project(p_connection uuid,p_actor uuid,p_project text,p_name text,p_origins text[])
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE existing public.projects%ROWTYPE; result jsonb;
BEGIN
  IF p_project IS NULL OR p_project !~ '^[a-z0-9]+(-[a-z0-9]+)*$' OR length(p_project)>63
    OR nullif(trim(p_name),'') IS NULL OR length(p_name)>80
    OR cardinality(p_origins) IS NULL OR cardinality(p_origins)<1 OR cardinality(p_origins)>20
    OR EXISTS (SELECT 1 FROM unnest(p_origins) AS host WHERE host IS NULL OR host='' OR host LIKE '%/%' OR host LIKE '%*%') THEN
    RAISE EXCEPTION 'invalid_project';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('crrt-project-claim:' || p_project,0));
  PERFORM public.mcp_require_connection(p_connection,p_actor,'crrt:projects');
  SELECT * INTO existing FROM public.projects WHERE public_key=p_project FOR UPDATE;
  IF FOUND THEN
    IF NOT EXISTS (SELECT 1 FROM public.project_members WHERE project_key=p_project AND user_id=p_actor AND is_owner)
      THEN RAISE EXCEPTION 'project_key_unavailable'; END IF;
    IF existing.name IS DISTINCT FROM p_name OR existing.allowed_origins IS DISTINCT FROM p_origins
      THEN RAISE EXCEPTION 'project_configuration_conflict'; END IF;
    RETURN;
  END IF;
  PERFORM public.cloud_require_write(p_actor);
  result:=public.claim_project(p_actor,p_project,p_name);
  IF result->>'status' IS DISTINCT FROM 'claimed' THEN RAISE EXCEPTION 'project_key_unavailable'; END IF;
  UPDATE public.projects SET allowed_origins=p_origins WHERE public_key=p_project;
END;
$$;
REVOKE ALL ON FUNCTION public.mcp_create_project(uuid,uuid,text,text,text[]) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.mcp_create_project(uuid,uuid,text,text,text[]) TO service_role;
