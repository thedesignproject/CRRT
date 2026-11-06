CREATE TABLE "document_feedback" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"document_id" uuid NOT NULL,
	"revision" integer NOT NULL,
	"parent_id" uuid,
	"quote" text DEFAULT '' NOT NULL,
	"prefix" text DEFAULT '' NOT NULL,
	"suffix" text DEFAULT '' NOT NULL,
	"target" jsonb,
	"body" text NOT NULL,
	"author" text NOT NULL,
	"actor_id" uuid,
	"review_status" text DEFAULT 'open' NOT NULL,
	"implementation_status" text DEFAULT 'unassigned' NOT NULL,
	"claimed_by" text,
	"progress_updates" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "document_feedback_review" CHECK ("document_feedback"."review_status" in ('open','accepted','rejected')),
	CONSTRAINT "document_feedback_progress" CHECK ("document_feedback"."implementation_status" in ('unassigned','in_progress','blocked','ready_for_testing','done')),
	CONSTRAINT "document_feedback_size" CHECK (length("document_feedback"."body") between 1 and 8000 AND length("document_feedback"."quote") <= 2000 AND length("document_feedback"."author") between 1 and 100)
);
--> statement-breakpoint
ALTER TABLE "document_feedback" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "document_invites" (
	"document_id" uuid NOT NULL,
	"email" text NOT NULL,
	CONSTRAINT "document_invites_document_id_email_pk" PRIMARY KEY("document_id","email"),
	CONSTRAINT "document_invites_email" CHECK (length("document_invites"."email") between 3 and 254 AND "document_invites"."email"=lower("document_invites"."email"))
);
--> statement-breakpoint
ALTER TABLE "document_invites" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "document_operations" (
	"key" text PRIMARY KEY NOT NULL,
	"document_id" uuid NOT NULL,
	"project_id" text,
	"owner_id" uuid NOT NULL,
	"actor_id" uuid,
	"action" text NOT NULL,
	"request_hash" text NOT NULL,
	"result" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "document_operations" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "document_revisions" (
	"document_id" uuid NOT NULL,
	"number" integer NOT NULL,
	"title" text NOT NULL,
	"body" text NOT NULL,
	"summary" text NOT NULL,
	"actor_id" uuid NOT NULL,
	"agent_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "document_revisions_document_id_number_pk" PRIMARY KEY("document_id","number"),
	CONSTRAINT "document_revisions_number" CHECK ("document_revisions"."number" > 0)
);
--> statement-breakpoint
ALTER TABLE "document_revisions" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "document_unlock_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"document_id" uuid NOT NULL,
	"connection_id" uuid NOT NULL,
	"share_key" uuid NOT NULL,
	"browser_proof_hash" text NOT NULL,
	"poll_proof_hash" text NOT NULL,
	"access_token" text,
	"expires_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "document_unlock_requests" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "documents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" text,
	"access_mode" text DEFAULT 'private' NOT NULL,
	"title" text NOT NULL,
	"body" text DEFAULT '' NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"published_revision" integer,
	"share_key" uuid DEFAULT gen_random_uuid() NOT NULL,
	"sharing" boolean DEFAULT false NOT NULL,
	"password_hash" text,
	"access_version" integer DEFAULT 1 NOT NULL,
	"archived" boolean DEFAULT false NOT NULL,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "documents_share_key_unique" UNIQUE("share_key"),
	CONSTRAINT "documents_access" CHECK ("documents"."access_mode" in ('private','project','link','password') AND ("documents"."access_mode"<>'project' OR "documents"."project_id" IS NOT NULL) AND ("documents"."access_mode"<>'password' OR "documents"."password_hash" IS NOT NULL)),
	CONSTRAINT "documents_size" CHECK (length("documents"."title") between 1 and 200 AND octet_length("documents"."body") <= 262144),
	CONSTRAINT "documents_version" CHECK ("documents"."version" > 0 AND "documents"."access_version" > 0)
);
--> statement-breakpoint
ALTER TABLE "documents" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "document_feedback" ADD CONSTRAINT "document_feedback_document_id_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."documents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_feedback" ADD CONSTRAINT "document_feedback_actor_id_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "auth"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_feedback" ADD CONSTRAINT "document_feedback_document_id_revision_document_revisions_document_id_number_fk" FOREIGN KEY ("document_id","revision") REFERENCES "public"."document_revisions"("document_id","number") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "document_feedback_identity" ON "document_feedback" USING btree ("id","document_id","revision");
--> statement-breakpoint
ALTER TABLE "document_feedback" ADD CONSTRAINT "document_feedback_parent_id_document_id_revision_document_feedback_id_document_id_revision_fk" FOREIGN KEY ("parent_id","document_id","revision") REFERENCES "public"."document_feedback"("id","document_id","revision") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_invites" ADD CONSTRAINT "document_invites_document_id_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."documents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_operations" ADD CONSTRAINT "document_operations_project_id_projects_public_key_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("public_key") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_revisions" ADD CONSTRAINT "document_revisions_document_id_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."documents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_revisions" ADD CONSTRAINT "document_revisions_actor_id_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "auth"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_unlock_requests" ADD CONSTRAINT "document_unlock_requests_document_id_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."documents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_unlock_requests" ADD CONSTRAINT "document_unlock_requests_connection_id_mcp_connections_id_fk" FOREIGN KEY ("connection_id") REFERENCES "public"."mcp_connections"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "documents_project_id_projects_public_key_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("public_key") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "documents_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "document_feedback_document" ON "document_feedback" USING btree ("document_id","created_at");--> statement-breakpoint
CREATE INDEX "document_unlock_requests_connection" ON "document_unlock_requests" USING btree ("connection_id");--> statement-breakpoint
CREATE INDEX "documents_project_updated" ON "documents" USING btree ("project_id","updated_at");
--> statement-breakpoint

GRANT ALL ON public.documents,public.document_revisions,public.document_feedback,public.document_operations,public.document_invites,public.document_unlock_requests TO service_role;
--> statement-breakpoint
CREATE FUNCTION public.document_project_removed() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
  IF NEW.project_id IS NULL AND NEW.access_mode='project' THEN
    NEW.access_mode:='private'; NEW.sharing:=false; NEW.access_version:=OLD.access_version+1;
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER document_project_removed BEFORE UPDATE OF project_id ON public.documents FOR EACH ROW EXECUTE FUNCTION public.document_project_removed();
--> statement-breakpoint
CREATE FUNCTION public.document_command(p_actor uuid,p_id uuid,p_action text,p_input jsonb,p_key text,p_hash text,p_access integer DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE d public.documents; f public.document_feedback; r public.document_revisions;
  m public.project_members; old public.document_operations; result jsonb; v_key text; n integer; v_role text; v_mode text; v_project text;
BEGIN
  v_key:=coalesce(p_actor::text,'guest') || ':' || p_id::text || ':' || p_key;
  PERFORM pg_advisory_xact_lock(hashtextextended('document:' || p_id::text,0));
  SELECT * INTO d FROM public.documents WHERE id=p_id;
  SELECT * INTO old FROM public.document_operations WHERE key=v_key;
  -- Match membership RPCs and FK cascades: projects before documents/members.
  PERFORM 1 FROM public.projects WHERE public_key IN (d.project_id,old.project_id,p_input->>'projectId') ORDER BY public_key FOR SHARE;
  SELECT * INTO d FROM public.documents WHERE id=p_id FOR UPDATE;
  v_project:=coalesce(d.project_id,old.project_id,p_input->>'projectId');
  SELECT * INTO m FROM public.project_members WHERE user_id=p_actor AND project_key=v_project FOR SHARE;
  IF p_actor IS NOT NULL AND NOT EXISTS(SELECT 1 FROM auth.users WHERE id=p_actor AND deleted_at IS NULL AND (banned_until IS NULL OR banned_until<now())) THEN RAISE EXCEPTION 'forbidden'; END IF;
  IF p_actor IS NOT NULL AND p_actor=coalesce(d.created_by,old.owner_id) THEN v_role:='admin';
  ELSIF d.access_mode='project' OR (d.id IS NULL AND old.project_id IS NOT NULL) THEN v_role:=m.role;
  ELSIF d.access_mode='private' AND EXISTS(SELECT 1 FROM public.document_invites i JOIN auth.users u ON lower(u.email)=i.email WHERE i.document_id=p_id AND u.id=p_actor) THEN v_role:='reader'; END IF;
  IF p_action='create' AND old.key IS NULL THEN
    IF p_actor IS NULL OR (v_project IS NOT NULL AND (m.role IS NULL OR m.role='guest')) THEN RAISE EXCEPTION 'forbidden'; END IF;
    v_role:='admin';
  END IF;
  IF p_action='comment' THEN
    IF v_role='guest' THEN RAISE EXCEPTION 'forbidden'; END IF;
    IF v_role IS NULL AND (d.access_mode IN ('link','password') AND d.sharing AND NOT d.archived AND d.published_revision IS NOT NULL AND p_access=d.access_version) IS NOT TRUE THEN RAISE EXCEPTION 'forbidden'; END IF;
  ELSIF v_role IS NULL OR v_role IN ('guest','reader') OR (p_action IN ('publish','sharing','archive','delete','assign','invite') AND v_role<>'admin') THEN RAISE EXCEPTION 'forbidden'; END IF;
  IF old.key IS NOT NULL THEN
    IF old.request_hash<>p_hash OR old.action<>p_action THEN RAISE EXCEPTION 'idempotency_conflict'; END IF;
    RETURN old.result;
  END IF;
  IF p_action='create' THEN
    IF d.id IS NOT NULL THEN RAISE EXCEPTION 'version_conflict'; END IF;
    PERFORM public.cloud_require_write(coalesce(public.cloud_owner(v_project),p_actor));
    INSERT INTO public.documents(id,project_id,title,body,created_by) VALUES(p_id,v_project,p_input->>'title',coalesce(p_input->>'body',''),p_actor) RETURNING * INTO d;
  ELSE
    IF d.id IS NULL THEN RAISE EXCEPTION 'document_not_found'; END IF;
    PERFORM public.cloud_require_write(coalesce(public.cloud_owner(d.project_id),d.created_by));
    IF p_action NOT IN ('comment','review','progress') AND d.version IS DISTINCT FROM (p_input->>'expectedVersion')::integer THEN RAISE EXCEPTION 'version_conflict'; END IF;
    IF d.archived AND p_action NOT IN ('archive','delete') THEN RAISE EXCEPTION 'document_archived'; END IF;
    CASE p_action
    WHEN 'save' THEN UPDATE public.documents SET title=p_input->>'title',body=p_input->>'body' WHERE id=p_id;
    WHEN 'publish' THEN
      n:=coalesce(d.published_revision,0)+1;
      INSERT INTO public.document_revisions(document_id,number,title,body,summary,actor_id,agent_id) VALUES(p_id,n,d.title,d.body,p_input->>'summary',p_actor,p_input->>'agentId');
      UPDATE public.documents SET published_revision=n WHERE id=p_id;
    WHEN 'restore' THEN
      SELECT * INTO r FROM public.document_revisions WHERE document_id=p_id AND number=(p_input->>'revision')::integer;
      IF NOT FOUND THEN RAISE EXCEPTION 'revision_not_found'; END IF;
      UPDATE public.documents SET title=r.title,body=r.body WHERE id=p_id;
    WHEN 'sharing' THEN
      v_mode:=coalesce(p_input->>'accessMode',CASE WHEN (p_input->>'sharing')::boolean THEN CASE WHEN coalesce(p_input->>'passwordHash',d.password_hash) IS NULL THEN 'link' ELSE 'password' END ELSE 'private' END);
      IF v_mode='project' AND d.project_id IS NULL THEN RAISE EXCEPTION 'forbidden'; END IF;
      UPDATE public.documents SET access_mode=v_mode,sharing=v_mode<>'private',
        password_hash=CASE WHEN v_mode<>'password' THEN NULL WHEN p_input ? 'passwordHash' THEN p_input->>'passwordHash' ELSE password_hash END,
        access_version=access_version+1,share_key=CASE WHEN coalesce((p_input->>'rotateLink')::boolean,false) THEN gen_random_uuid() ELSE share_key END WHERE id=p_id;
    WHEN 'assign' THEN
      IF p_input->>'projectId' IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.project_members WHERE project_key=p_input->>'projectId' AND user_id=p_actor AND role IN ('admin','member')) THEN RAISE EXCEPTION 'forbidden'; END IF;
      UPDATE public.documents SET project_id=p_input->>'projectId',access_version=access_version+1 WHERE id=p_id;
    WHEN 'invite' THEN
      IF (p_input->>'remove')::boolean THEN DELETE FROM public.document_invites WHERE document_id=p_id AND email=lower(p_input->>'email');
      ELSE INSERT INTO public.document_invites(document_id,email) VALUES(p_id,lower(p_input->>'email')) ON CONFLICT DO NOTHING; END IF;
      UPDATE public.documents SET access_version=access_version+1 WHERE id=p_id;
    WHEN 'archive' THEN UPDATE public.documents SET archived=(p_input->>'archived')::boolean,access_version=access_version+1 WHERE id=p_id;
    WHEN 'delete' THEN DELETE FROM public.documents WHERE id=p_id;
    WHEN 'comment' THEN
      IF NOT EXISTS(SELECT 1 FROM public.document_revisions WHERE document_id=p_id AND number=(p_input->>'revision')::integer) THEN RAISE EXCEPTION 'revision_not_found'; END IF;
      IF (v_role IS NULL OR v_role='reader') AND (p_input->>'revision')::integer<>d.published_revision AND p_input->>'parentId' IS NULL THEN RAISE EXCEPTION 'revision_not_found'; END IF;
      IF p_input->>'parentId' IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.document_feedback WHERE id=(p_input->>'parentId')::uuid AND document_id=p_id AND parent_id IS NULL AND revision=(p_input->>'revision')::integer) THEN RAISE EXCEPTION 'feedback_not_found'; END IF;
      INSERT INTO public.document_feedback(document_id,revision,parent_id,quote,prefix,suffix,target,body,author,actor_id)
        VALUES(p_id,(p_input->>'revision')::integer,(p_input->>'parentId')::uuid,coalesce(p_input->>'quote',''),coalesce(p_input->>'prefix',''),coalesce(p_input->>'suffix',''),p_input->'target',p_input->>'body',p_input->>'author',p_actor) RETURNING * INTO f;
    WHEN 'review','progress' THEN
      SELECT * INTO f FROM public.document_feedback WHERE id=(p_input->>'feedbackId')::uuid AND document_id=p_id AND parent_id IS NULL FOR UPDATE;
      IF NOT FOUND THEN RAISE EXCEPTION 'feedback_not_found'; END IF;
      IF f.version IS DISTINCT FROM (p_input->>'feedbackVersion')::integer THEN RAISE EXCEPTION 'version_conflict'; END IF;
      IF p_action='review' THEN UPDATE public.document_feedback SET review_status=p_input->>'reviewStatus',implementation_status=coalesce(p_input->>'implementationStatus','unassigned'),claimed_by=NULL,version=version+1 WHERE id=f.id;
      ELSE
        IF coalesce(p_input->>'agentId','') !~ '^[A-Za-z0-9_-]{1,64}$' THEN RAISE EXCEPTION 'claim_required'; END IF;
        IF coalesce(p_input->>'operation','') NOT IN ('claim','start','block','complete') THEN RAISE EXCEPTION 'invalid_action'; END IF;
        IF f.review_status<>'accepted' OR f.implementation_status IN ('done','ready_for_testing') THEN RAISE EXCEPTION 'feedback_not_eligible'; END IF;
        IF f.claimed_by IS NOT NULL AND f.claimed_by<>p_input->>'agentId' THEN RAISE EXCEPTION 'claim_conflict'; END IF;
        IF p_input->>'operation'<>'claim' AND f.claimed_by IS DISTINCT FROM p_input->>'agentId' THEN RAISE EXCEPTION 'claim_required'; END IF;
        UPDATE public.document_feedback SET progress_updates=progress_updates || jsonb_build_array(jsonb_build_object('operation',p_input->>'operation','summary',p_input->>'summary','agentId',p_input->>'agentId','createdAt',clock_timestamp())),claimed_by=p_input->>'agentId',implementation_status=CASE p_input->>'operation' WHEN 'complete' THEN 'ready_for_testing' WHEN 'block' THEN 'blocked' ELSE 'in_progress' END,version=version+1 WHERE id=f.id;
      END IF;
    ELSE RAISE EXCEPTION 'invalid_action';
    END CASE;
    IF p_action NOT IN ('comment','review','progress','delete') THEN UPDATE public.documents SET version=version+1,updated_at=clock_timestamp() WHERE id=p_id RETURNING * INTO d; END IF;
  END IF;
  result:=jsonb_build_object('id',p_id,'version',d.version,'publishedRevision',d.published_revision,'feedbackId',f.id);
  INSERT INTO public.document_operations(key,document_id,project_id,owner_id,actor_id,action,request_hash,result) VALUES(v_key,p_id,d.project_id,d.created_by,p_actor,p_action,p_hash,result);
  RETURN result;
END;
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION public.document_command(uuid,uuid,text,jsonb,text,text,integer) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.document_command(uuid,uuid,text,jsonb,text,text,integer) TO service_role;
--> statement-breakpoint
CREATE FUNCTION public.document_revision_immutable() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
  IF TG_OP='UPDATE' OR EXISTS(SELECT 1 FROM public.documents WHERE id=OLD.document_id) THEN RAISE EXCEPTION 'published_revision_immutable'; END IF;
  RETURN OLD;
END;
$$;
CREATE TRIGGER document_revision_immutable BEFORE UPDATE OR DELETE ON public.document_revisions FOR EACH ROW EXECUTE FUNCTION public.document_revision_immutable();
--> statement-breakpoint
NOTIFY pgrst, 'reload schema';
