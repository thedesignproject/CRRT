CREATE TABLE "cloud_plan_settings" (
	"id" integer PRIMARY KEY DEFAULT 1 NOT NULL,
	"enabled" boolean DEFAULT false NOT NULL,
	CONSTRAINT "cloud_plan_settings_singleton" CHECK ("cloud_plan_settings"."id" = 1)
);
--> statement-breakpoint
ALTER TABLE "cloud_plan_settings" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "cloud_usage" (
	"resource_id" uuid NOT NULL,
	"resource" text NOT NULL,
	"owner_id" uuid NOT NULL,
	"window_start" timestamp with time zone NOT NULL,
	"window_end" timestamp with time zone NOT NULL,
	"released" boolean DEFAULT false NOT NULL,
	CONSTRAINT "cloud_usage_resource_resource_id_pk" PRIMARY KEY("resource","resource_id"),
	CONSTRAINT "cloud_usage_resource_check" CHECK ("cloud_usage"."resource" in ('comments', 'product_audits')),
	CONSTRAINT "cloud_usage_window_check" CHECK ("cloud_usage"."window_end" > "cloud_usage"."window_start")
);
--> statement-breakpoint
ALTER TABLE "cloud_usage" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "deleted_extension_feedback" (
	"id" uuid PRIMARY KEY NOT NULL,
	"actor_id" uuid,
	"screenshot_storage_path" text,
	"deleted_at" timestamp with time zone DEFAULT now() NOT NULL,
	"cleanup_pending" boolean DEFAULT true NOT NULL,
	"cleanup_after" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "deleted_extension_feedback" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "extension_screenshot_upload_windows" (
	"comment_id" uuid PRIMARY KEY NOT NULL,
	"expires_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "extension_screenshot_upload_windows" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "billing_accounts" ADD COLUMN "plan" text;--> statement-breakpoint
ALTER TABLE "billing_accounts" ADD COLUMN "trial_used" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "billing_accounts" ADD COLUMN "period_start" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "billing_accounts" ADD COLUMN "grace_until" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "billing_accounts" ADD COLUMN "checkout_payload" jsonb;--> statement-breakpoint
ALTER TABLE "project_invites" ADD COLUMN "expires_at" timestamp with time zone DEFAULT now() + interval '7 days' NOT NULL;--> statement-breakpoint
ALTER TABLE "cloud_usage" ADD CONSTRAINT "cloud_usage_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "auth"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "extension_screenshot_upload_windows" ADD CONSTRAINT "extension_screenshot_upload_windows_comment_id_comments_id_fk" FOREIGN KEY ("comment_id") REFERENCES "public"."comments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "cloud_usage_owner_window_idx" ON "cloud_usage" USING btree ("owner_id","window_start","resource");--> statement-breakpoint
CREATE INDEX "deleted_extension_feedback_sweep" ON "deleted_extension_feedback" USING btree ("cleanup_after","id") WHERE "deleted_extension_feedback"."cleanup_pending";
--> statement-breakpoint

INSERT INTO public.cloud_plan_settings(id, enabled) VALUES (1, false);
--> statement-breakpoint
CREATE FUNCTION public.cloud_enabled() RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT coalesce((SELECT enabled FROM public.cloud_plan_settings WHERE id=1), false);
$$;
--> statement-breakpoint
CREATE FUNCTION public.cloud_owner(p_project text) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_owner uuid;
BEGIN
  PERFORM 1 FROM public.projects WHERE public_key=p_project FOR SHARE;
  SELECT user_id INTO v_owner FROM public.project_members WHERE project_key=p_project AND is_owner;
  RETURN v_owner;
END;
$$;
--> statement-breakpoint
CREATE FUNCTION public.cloud_limit(p_owner uuid, p_resource text) RETURNS integer
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT CASE p_resource
    WHEN 'projects' THEN CASE WHEN plan='studio' THEN 50 ELSE 10 END
    WHEN 'internal_users' THEN CASE WHEN plan='studio' THEN 25 ELSE 10 END
    WHEN 'comments' THEN CASE WHEN plan='studio' THEN 10000 ELSE 2000 END
    WHEN 'product_audits' THEN CASE WHEN plan='studio' THEN 30 ELSE 5 END
  END FROM public.billing_accounts WHERE user_id=p_owner;
$$;
--> statement-breakpoint
CREATE FUNCTION public.cloud_usage_count(p_owner uuid, p_resource text) RETURNS integer
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT count(*)::integer FROM public.cloud_usage u JOIN public.billing_accounts b ON b.user_id=u.owner_id
    WHERE u.owner_id=p_owner AND u.resource=p_resource AND NOT u.released AND u.window_start=b.period_start;
$$;
--> statement-breakpoint
CREATE FUNCTION public.cloud_internal_identities(p_owner uuid) RETURNS TABLE(identity_key text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT 'u:' || p_owner::text
  UNION
  SELECT public.agent_collaborator_identity_key(m.user_id,null)
    FROM public.project_members m JOIN public.project_members o ON o.project_key=m.project_key AND o.is_owner
    WHERE o.user_id=p_owner AND m.role IN ('admin','member')
  UNION
  SELECT public.agent_collaborator_identity_key(null,i.email)
    FROM public.project_invites i JOIN public.project_members o ON o.project_key=i.project_key AND o.is_owner
    WHERE o.user_id=p_owner AND i.role IN ('admin','member') AND i.expires_at>now();
$$;
--> statement-breakpoint
CREATE FUNCTION public.cloud_fail(p_owner uuid, p_resource text, p_used integer DEFAULT 0) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_detail text;
BEGIN
  v_detail:=jsonb_build_object(
    'code','plan_limit','resource',p_resource,'usage',p_used,'limit',public.cloud_limit(p_owner,p_resource),
    'resetAt',CASE WHEN p_resource IN ('comments','product_audits') THEN
      (SELECT period_end FROM public.billing_accounts WHERE user_id=p_owner) END,
    'action',CASE WHEN p_resource='subscription' THEN 'manage_billing' ELSE 'upgrade_or_wait' END)::text;
  RAISE EXCEPTION USING MESSAGE='cloud_plan_limit:' || v_detail, DETAIL=v_detail;
END;
$$;
--> statement-breakpoint
CREATE FUNCTION public.cloud_validate_write(p_owner uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE b public.billing_accounts%ROWTYPE;
BEGIN
  IF NOT public.cloud_enabled() THEN RETURN; END IF;
  IF p_owner IS NULL THEN PERFORM public.cloud_fail(p_owner,'subscription'); END IF;
  SELECT * INTO b FROM public.billing_accounts WHERE user_id=p_owner FOR SHARE;
  IF b.plan IS NULL OR b.plan NOT IN ('pro','studio') OR b.period_start IS NULL OR b.period_start>now()
    OR b.period_end IS NULL OR b.period_end<=now()
    OR NOT coalesce((b.subscription_status IN ('active','trialing')
      OR (b.subscription_status='past_due' AND b.grace_until>now())),false) THEN
    PERFORM public.cloud_fail(p_owner,'subscription');
  END IF;
END;
$$;
--> statement-breakpoint
-- Quota admission alone needs owner-wide serialization. Non-consuming writes
-- validate the billing row without reversing existing workflow/comment locks.
CREATE FUNCTION public.cloud_require_write(p_owner uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF NOT public.cloud_enabled() THEN RETURN; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('crrt-cloud:' || p_owner::text,0));
  PERFORM public.cloud_validate_write(p_owner);
END;
$$;
--> statement-breakpoint
CREATE FUNCTION public.cloud_check_capacity(p_owner uuid, p_resource text, p_increment integer DEFAULT 0) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_used integer;
BEGIN
  IF NOT public.cloud_enabled() THEN RETURN; END IF;
  PERFORM public.cloud_require_write(p_owner);
  IF p_resource='projects' THEN
    SELECT count(*) INTO v_used FROM public.project_members WHERE user_id=p_owner AND is_owner;
  ELSIF p_resource='internal_users' THEN
    SELECT count(*) INTO v_used FROM public.cloud_internal_identities(p_owner);
  ELSE
    v_used:=public.cloud_usage_count(p_owner,p_resource);
  END IF;
  IF v_used+p_increment>public.cloud_limit(p_owner,p_resource) THEN
    PERFORM public.cloud_fail(p_owner,p_resource,v_used);
  END IF;
END;
$$;
--> statement-breakpoint
CREATE FUNCTION public.cloud_charge(p_owner uuid,p_resource text,p_id uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF NOT public.cloud_enabled() THEN RETURN; END IF;
  PERFORM public.cloud_require_write(p_owner);
  IF EXISTS(SELECT 1 FROM public.cloud_usage WHERE resource=p_resource AND resource_id=p_id) THEN RETURN; END IF;
  PERFORM public.cloud_check_capacity(p_owner,p_resource,1);
  INSERT INTO public.cloud_usage(resource_id,resource,owner_id,window_start,window_end)
    SELECT p_id,p_resource,user_id,period_start,period_end FROM public.billing_accounts WHERE user_id=p_owner;
END;
$$;
--> statement-breakpoint
CREATE FUNCTION public.cloud_comment_guard() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_owner uuid;
BEGIN
  IF NOT public.cloud_enabled() THEN RETURN NEW; END IF;
  v_owner:=public.cloud_owner(NEW.project_id);
  IF TG_OP='INSERT' THEN
    PERFORM public.cloud_charge(v_owner,'comments',NEW.id);
  ELSIF NEW.project_id IS DISTINCT FROM OLD.project_id THEN
    -- Personal feedback imported into Cloud counts once; transferring charged feedback does not recount it.
    PERFORM public.cloud_charge(v_owner,'comments',NEW.id);
  ELSE
    PERFORM public.cloud_validate_write(v_owner);
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER cloud_comment_guard BEFORE INSERT OR UPDATE ON public.comments
  FOR EACH ROW EXECUTE FUNCTION public.cloud_comment_guard();
--> statement-breakpoint
CREATE FUNCTION public.cloud_project_guard() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_owner uuid;
BEGIN
  IF NOT public.cloud_enabled() THEN RETURN NEW; END IF;
  v_owner:=public.cloud_owner(NEW.public_key);
  PERFORM public.cloud_check_capacity(v_owner,'projects');
  RETURN NEW;
END;
$$;
--> statement-breakpoint
-- Deferred so claim_project can atomically insert a project and its owner.
CREATE CONSTRAINT TRIGGER cloud_project_created AFTER INSERT ON public.projects
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION public.cloud_project_guard();
--> statement-breakpoint
CREATE FUNCTION public.cloud_project_update_guard() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF public.cloud_enabled() THEN
    -- Claim RPC marks an unowned project before inserting its first owner.
    IF public.cloud_owner(NEW.public_key) IS NOT NULL THEN
      PERFORM public.cloud_validate_write(public.cloud_owner(NEW.public_key));
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER cloud_project_updated BEFORE UPDATE ON public.projects
  FOR EACH ROW EXECUTE FUNCTION public.cloud_project_update_guard();
--> statement-breakpoint
CREATE OR REPLACE FUNCTION public.enforce_agent_invite_seat() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_owner uuid; v_key text;
BEGIN
  IF NOT public.cloud_enabled() THEN RETURN NEW; END IF;
  v_owner:=public.cloud_owner(NEW.project_key);
  PERFORM public.cloud_require_write(v_owner);
  IF NEW.role='guest' OR NEW.expires_at<=now() THEN RETURN NEW; END IF;
  v_key:=public.agent_collaborator_identity_key(null,NEW.email);
  IF EXISTS(SELECT 1 FROM public.cloud_internal_identities(v_owner) WHERE identity_key=v_key) THEN RETURN NEW; END IF;
  PERFORM public.cloud_check_capacity(v_owner,'internal_users',1);
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION public.enforce_agent_member_seat() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_owner uuid; v_key text;
BEGIN
  IF TG_OP='DELETE' THEN RETURN OLD; END IF;
  IF NOT public.cloud_enabled() THEN RETURN NEW; END IF;
  v_owner:=public.cloud_owner(NEW.project_key);
  -- Transfer RPC temporarily clears the old owner; the AFTER guard validates the new sponsor.
  IF TG_OP='UPDATE' AND (NEW.is_owner IS DISTINCT FROM OLD.is_owner) THEN RETURN NEW; END IF;
  IF NEW.is_owner THEN v_owner:=NEW.user_id; END IF;
  PERFORM public.cloud_require_write(v_owner);
  IF NEW.role='guest' THEN RETURN NEW; END IF;
  v_key:=public.agent_collaborator_identity_key(NEW.user_id,null);
  IF EXISTS(SELECT 1 FROM public.cloud_internal_identities(v_owner) WHERE identity_key=v_key) THEN RETURN NEW; END IF;
  PERFORM public.cloud_check_capacity(v_owner,'internal_users',1);
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE FUNCTION public.cloud_owner_capacity_guard() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF public.cloud_enabled() AND NEW.is_owner THEN
    PERFORM public.cloud_check_capacity(NEW.user_id,'projects');
    PERFORM public.cloud_check_capacity(NEW.user_id,'internal_users');
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER cloud_owner_capacity_guard AFTER INSERT OR UPDATE OF is_owner ON public.project_members
  FOR EACH ROW EXECUTE FUNCTION public.cloud_owner_capacity_guard();
--> statement-breakpoint
CREATE OR REPLACE FUNCTION public.agent_collaborator_has_seat(p_owner uuid,p_actor uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  -- Capacity stops additions, never revokes existing membership on downgrade.
  SELECT p_actor=p_owner OR EXISTS(SELECT 1 FROM public.project_members o JOIN public.project_members a
    ON a.project_key=o.project_key WHERE o.is_owner AND o.user_id=p_owner AND a.user_id=p_actor
    AND a.role IN ('admin','member'));
$$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION public.change_project_member_role(
  p_project_key text,p_actor_user_id uuid,p_target_user_id uuid,p_role text
) RETURNS jsonb LANGUAGE plpgsql SET search_path = '' AS $$
DECLARE v_owner uuid; v_sponsor uuid; v_result jsonb;
BEGIN
  PERFORM 1 FROM public.projects WHERE public_key=p_project_key FOR UPDATE;
  v_owner:=public.cloud_owner(p_project_key);
  IF public.cloud_enabled() THEN
    FOR v_sponsor IN SELECT DISTINCT sponsor FROM unnest(ARRAY[v_owner,
      CASE WHEN p_role='owner' THEN p_target_user_id END]) s(sponsor) WHERE sponsor IS NOT NULL ORDER BY sponsor LOOP
      PERFORM public.cloud_require_write(v_sponsor);
    END LOOP;
  END IF;
  v_result:=public.change_project_member_role_unfenced(p_project_key,p_actor_user_id,p_target_user_id,p_role);
  IF p_role='owner' AND v_result->>'status'='updated' THEN
    PERFORM public.cloud_check_capacity(p_target_user_id,'projects');
    PERFORM public.cloud_check_capacity(p_target_user_id,'internal_users');
  END IF;
  RETURN v_result;
END;
$$;
--> statement-breakpoint
CREATE FUNCTION public.cloud_audit_guard() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF NOT public.cloud_enabled() THEN RETURN NEW; END IF;
  IF TG_OP='INSERT' THEN
    PERFORM public.cloud_charge(public.cloud_owner(NEW.project_key),'product_audits',NEW.id);
  ELSIF (NEW.status='failed' AND OLD.status NOT IN ('completed','partial'))
    OR (NEW.status='cancelled' AND NEW.started_at IS NULL) THEN
    -- Refund the original owner's original window, even after renewal/transfer.
    UPDATE public.cloud_usage SET released=true WHERE resource='product_audits' AND resource_id=NEW.id;
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER cloud_audit_guard BEFORE INSERT OR UPDATE OF status ON public.audit_runs
  FOR EACH ROW EXECUTE FUNCTION public.cloud_audit_guard();
--> statement-breakpoint
CREATE FUNCTION public.cloud_workflow_guard() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_row jsonb; v_project text;
BEGIN
  IF NOT public.cloud_enabled() THEN RETURN NEW; END IF;
  v_row:=to_jsonb(NEW);
  v_project:=coalesce(v_row->>'project_id',v_row->>'project_key');
  PERFORM public.cloud_validate_write(public.cloud_owner(v_project));
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER cloud_share_guard BEFORE INSERT ON public.feedback_shares
  FOR EACH ROW EXECUTE FUNCTION public.cloud_workflow_guard();
--> statement-breakpoint
CREATE TRIGGER cloud_external_work_guard BEFORE INSERT ON public.comment_external_work
  FOR EACH ROW EXECUTE FUNCTION public.cloud_workflow_guard();
--> statement-breakpoint
CREATE TRIGGER cloud_external_work_retry_guard BEFORE UPDATE OF lease_token ON public.comment_external_work
  FOR EACH ROW EXECUTE FUNCTION public.cloud_workflow_guard();
--> statement-breakpoint
CREATE TRIGGER cloud_integration_guard BEFORE INSERT OR UPDATE ON public.project_integrations
  FOR EACH ROW EXECUTE FUNCTION public.cloud_workflow_guard();
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER cloud_repo_guard AFTER INSERT ON public.project_repo_configs
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION public.cloud_workflow_guard();
--> statement-breakpoint
CREATE TRIGGER cloud_repo_update_guard BEFORE UPDATE ON public.project_repo_configs
  FOR EACH ROW EXECUTE FUNCTION public.cloud_workflow_guard();
--> statement-breakpoint
CREATE TRIGGER cloud_email_domain_guard BEFORE INSERT OR UPDATE ON public.project_email_domains
  FOR EACH ROW EXECUTE FUNCTION public.cloud_workflow_guard();
--> statement-breakpoint
CREATE FUNCTION public.cloud_entitlements(p_owner uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE b public.billing_accounts%ROWTYPE; v_projects integer; v_users integer; v_writes boolean:=false;
BEGIN
  SELECT * INTO b FROM public.billing_accounts WHERE user_id=p_owner;
  SELECT count(*) INTO v_projects FROM public.project_members WHERE user_id=p_owner AND is_owner;
  SELECT count(*) INTO v_users FROM public.cloud_internal_identities(p_owner);
  BEGIN PERFORM public.cloud_validate_write(p_owner); v_writes:=true;
    EXCEPTION WHEN raise_exception THEN v_writes:=false; END;
  RETURN jsonb_build_object('mode',CASE WHEN public.cloud_enabled() THEN 'cloud' ELSE 'community' END,
    'plan',b.plan,'status',coalesce(b.subscription_status,'none'),'canWrite',v_writes,'trialUsed',coalesce(b.trial_used,false),
    'resetAt',b.period_end,'usage',jsonb_build_object('projects',v_projects,'internal_users',v_users,
    'comments',public.cloud_usage_count(p_owner,'comments'),'product_audits',public.cloud_usage_count(p_owner,'product_audits')),
    'limits',jsonb_build_object('projects',public.cloud_limit(p_owner,'projects'),
    'internal_users',public.cloud_limit(p_owner,'internal_users'),'comments',public.cloud_limit(p_owner,'comments'),
    'product_audits',public.cloud_limit(p_owner,'product_audits')));
END;
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION public.cloud_enabled(),public.cloud_owner(text),public.cloud_limit(uuid,text),
  public.cloud_usage_count(uuid,text),public.cloud_internal_identities(uuid),public.cloud_fail(uuid,text,integer),
  public.cloud_validate_write(uuid),public.cloud_require_write(uuid),public.cloud_check_capacity(uuid,text,integer),public.cloud_charge(uuid,text,uuid),
  public.cloud_comment_guard(),public.cloud_project_guard(),public.cloud_project_update_guard(),
  public.cloud_owner_capacity_guard(),public.cloud_audit_guard(),public.cloud_workflow_guard(),
  public.cloud_entitlements(uuid) FROM PUBLIC,anon,authenticated;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.cloud_entitlements(uuid),public.cloud_owner(text),
  public.cloud_validate_write(uuid),public.cloud_require_write(uuid),public.cloud_check_capacity(uuid,text,integer) TO service_role;
--> statement-breakpoint
NOTIFY pgrst,'reload schema';

--> statement-breakpoint

CREATE OR REPLACE FUNCTION public.create_widget_agent_share(
  p_project text,
  p_actor uuid,
  p_page_url text,
  p_idempotency_key text,
  p_request_hash text,
  p_allowed_prices text[],
  p_share jsonb,
  p_comments uuid[]
)
RETURNS SETOF public.feedback_shares LANGUAGE plpgsql SET search_path = '' AS $$
DECLARE
  v_owner uuid;
  v_is_owner boolean;
  v_status text;
  v_price text;
  v_requested uuid[];
  v_ids uuid[];
  v_share public.feedback_shares%ROWTYPE;
BEGIN
  IF p_page_url IS NULL OR p_page_url = ''
    OR p_idempotency_key !~ '^[A-Za-z0-9_-]{16,128}$'
    OR p_request_hash !~ '^[0-9a-f]{64}$'
    OR cardinality(p_comments) IS NULL OR cardinality(p_comments) < 1 OR cardinality(p_comments) > 100 THEN
    RAISE EXCEPTION 'invalid_widget_agent_request';
  END IF;

  SELECT array_agg(DISTINCT requested.id ORDER BY requested.id)
    INTO v_requested FROM unnest(p_comments) requested(id);
  IF cardinality(v_requested) <> cardinality(p_comments) THEN RAISE EXCEPTION 'invalid_selection'; END IF;

  PERFORM public.lock_feedback_actor(p_project,p_actor,'agent:operate');
  SELECT owner.user_id, actor.is_owner INTO v_owner, v_is_owner
    FROM public.project_members owner JOIN public.project_members actor ON actor.project_key = owner.project_key
    WHERE owner.project_key = p_project AND owner.is_owner AND actor.user_id = p_actor;
  IF v_owner IS NULL THEN RAISE EXCEPTION 'project_access_denied'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('crrt-agent-seats:' || v_owner::text, 0));
  IF NOT v_is_owner AND NOT public.agent_collaborator_has_seat(v_owner, p_actor) THEN
    RAISE EXCEPTION 'seat_limit_reached';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(
    'crrt-widget-agent:' || p_project || ':' || p_actor::text || ':' || p_idempotency_key, 0
  ));
  SELECT s.* INTO v_share FROM public.feedback_shares s
    WHERE s.project_id=p_project AND s.actor_user_id=p_actor AND s.idempotency_key=p_idempotency_key FOR UPDATE;
  IF v_share.id IS NOT NULL THEN
    IF v_share.request_hash IS DISTINCT FROM p_request_hash THEN RAISE EXCEPTION 'idempotency_conflict'; END IF;
    RETURN NEXT v_share;
    RETURN;
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended('crrt-github-issue:' || p_project,0));
  SELECT array_agg(eligible.id ORDER BY eligible.id) INTO v_ids FROM (
    SELECT c.id FROM public.comments c
      WHERE c.id=ANY(p_comments) AND c.project_id=p_project AND c.url=p_page_url
        AND c.visibility='shared' AND c.status IN ('pending','approved')
        AND coalesce(c.implementation_status,'unassigned') NOT IN ('done','ready_for_testing')
      ORDER BY c.id FOR UPDATE
  ) eligible;
  IF cardinality(v_ids) IS NULL OR cardinality(v_ids) <> cardinality(p_comments) THEN RAISE EXCEPTION 'invalid_selection'; END IF;

  -- Match existing feedback mutations: workflow/comment locks precede billing.
  PERFORM public.cloud_validate_write(v_owner);

  UPDATE public.comments c SET status='approved',updated_at=now()
    WHERE c.id=ANY(v_ids) AND c.project_id=p_project AND c.status='pending';
  INSERT INTO public.feedback_shares(
    project_id,scope_type,scope_page_url,slug,access_token_hash,access_token_ciphertext,
    created_by,actor_user_id,idempotency_key,request_hash,expires_at
  ) VALUES(
    p_project,'selection',p_page_url,p_share->>'slug',p_share->>'access_token_hash',
    p_share->>'access_token_ciphertext','reviewer',p_actor,p_idempotency_key,p_request_hash,
    (p_share->>'expires_at')::timestamptz
  ) RETURNING * INTO v_share;
  INSERT INTO public.feedback_share_items(share_id,comment_id) SELECT v_share.id,unnest(v_ids);
  INSERT INTO public.feedback_events(share_id,actor_type,actor_id,event_type,payload)
    VALUES(v_share.id,'reviewer',p_actor::text,'share.created',
      jsonb_build_object('scopeType','selection','commentCount',cardinality(v_ids),'source','widget'));
  RETURN NEXT v_share;
END;
$$;
--> statement-breakpoint

--> statement-breakpoint

CREATE FUNCTION public.import_cloud_feedback(p_actor uuid,p_project text,p_name text,p_comments jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_owner uuid; v_comment jsonb; v_id uuid; v_existing public.comments%ROWTYPE; v_imported integer:=0; v_screenshots jsonb:='[]';
BEGIN
  IF p_actor IS NULL OR p_project IS NULL OR p_project !~ '^[a-z0-9]+(-[a-z0-9]+)*$'
    OR length(p_project)>63 OR nullif(trim(p_name),'') IS NULL OR length(p_name)>80
    OR jsonb_typeof(p_comments) IS DISTINCT FROM 'array' OR jsonb_array_length(p_comments)>50 THEN
    RAISE EXCEPTION 'invalid_import';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('crrt-project-claim:' || p_project,0));
  v_owner:=public.cloud_owner(p_project);
  IF v_owner IS NULL THEN
    PERFORM public.cloud_require_write(p_actor);
    PERFORM public.claim_project(p_actor,p_project,p_name);
    v_owner:=public.cloud_owner(p_project);
  END IF;
  IF v_owner IS DISTINCT FROM p_actor THEN RAISE EXCEPTION 'forbidden'; END IF;
  FOR v_comment IN SELECT value FROM jsonb_array_elements(p_comments) LOOP
    v_id:=(v_comment->>'id')::uuid;
    SELECT * INTO v_existing FROM public.comments WHERE id=v_id;
    IF FOUND THEN
      IF v_existing.project_id IS DISTINCT FROM p_project OR v_existing.created_by_user_id IS DISTINCT FROM p_actor THEN
        RAISE EXCEPTION 'import_id_conflict';
      END IF;
      -- Retries may repair only the canonical admitted screenshot. Never upload
      -- new formats/assets for an existing ID, or write storage after expiry.
      IF v_existing.screenshot_storage_path IS NOT NULL AND
        v_existing.screenshot_storage_path = v_comment->>'screenshotStoragePath' THEN
        -- Mixed retry/new batches keep owner-before-billing admission order.
        PERFORM public.cloud_require_write(v_owner);
        v_screenshots:=v_screenshots || jsonb_build_array(jsonb_build_object('id',v_id,'path',v_existing.screenshot_storage_path));
      END IF;
      CONTINUE;
    END IF;
    -- The INSERT trigger validates and locks quota admission before billing.
    IF nullif(trim(v_comment->>'body'),'') IS NULL OR length(v_comment->>'body')>5000
      OR nullif(v_comment->>'pageUrl','') IS NULL OR nullif(v_comment->>'selector','') IS NULL THEN
      RAISE EXCEPTION 'invalid_import';
    END IF;
    INSERT INTO public.comments(id,project_id,source,created_by_user_id,url,page_hostname,x,y,element,
      comment,created_by,author_name,status,implementation_status,screenshot_storage_path,target_type,anchor)
    VALUES(v_id,p_project,'extension',p_actor,v_comment->>'pageUrl',v_comment->>'pageHostname',
      (v_comment->>'x')::float8,(v_comment->>'y')::float8,v_comment->>'selector',v_comment->>'body',
      'extension',v_comment->>'authorName',CASE WHEN v_comment->>'reviewStatus'='accepted' THEN 'approved'
        WHEN v_comment->>'reviewStatus'='rejected' THEN 'rejected' ELSE 'pending' END,
      CASE WHEN v_comment->>'reviewStatus'='accepted' THEN 'done' ELSE 'unassigned' END,
      v_comment->>'screenshotStoragePath',coalesce(v_comment->>'targetType','element_point'),v_comment->'anchor');
    IF v_comment->>'screenshotStoragePath' IS NOT NULL THEN
      v_screenshots:=v_screenshots || jsonb_build_array(jsonb_build_object('id',v_id,'path',v_comment->>'screenshotStoragePath'));
    END IF;
    v_imported:=v_imported+1;
  END LOOP;
  RETURN jsonb_build_object('projectId',p_project,'imported',v_imported,'screenshots',v_screenshots);
END;
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION public.import_cloud_feedback(uuid,text,text,jsonb) FROM PUBLIC,anon,authenticated;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.import_cloud_feedback(uuid,text,text,jsonb) TO service_role;

--> statement-breakpoint
CREATE OR REPLACE FUNCTION public.accept_project_invite_with_seat(p_user uuid, p_email text, p_project text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_invite public.project_invites%ROWTYPE;
BEGIN
  SELECT i.* INTO v_invite FROM public.project_invites i
    WHERE i.project_key = p_project AND i.email = lower(trim(p_email)) FOR UPDATE;
  IF NOT FOUND THEN
    IF EXISTS (SELECT 1 FROM public.project_members m WHERE m.project_key = p_project AND m.user_id = p_user) THEN
      RETURN null;
    END IF;
    RAISE EXCEPTION 'not_found';
  END IF;
  IF v_invite.expires_at<=now() THEN RAISE EXCEPTION 'not_found'; END IF;
  DELETE FROM public.project_invites i WHERE i.project_key = v_invite.project_key AND i.email = v_invite.email;
  INSERT INTO public.project_members(project_key, user_id, role)
    VALUES(v_invite.project_key, p_user, v_invite.role) ON CONFLICT DO NOTHING;
  RETURN v_invite.invited_by;
END;
$$;
--> statement-breakpoint

--> statement-breakpoint

DROP TRIGGER IF EXISTS zz_enforce_agent_invite_seat ON public.project_invites;
--> statement-breakpoint
CREATE TRIGGER zz_enforce_agent_invite_seat BEFORE INSERT OR UPDATE OF project_key,email,role,expires_at
  ON public.project_invites FOR EACH ROW EXECUTE FUNCTION public.enforce_agent_invite_seat();

--> statement-breakpoint

CREATE OR REPLACE FUNCTION public.assign_actor_inbox_feedback(p_actor uuid, p_project text, p_ids uuid[], p_visibility text)
RETURNS TABLE(id uuid) LANGUAGE plpgsql SET search_path = '' AS $$
DECLARE v_role text;
BEGIN
  PERFORM 1 FROM public.projects p WHERE p.public_key=p_project FOR SHARE;
  SELECT m.role INTO v_role FROM public.project_members m WHERE m.project_key=p_project AND m.user_id=p_actor;
  -- All current members may create feedback, including guests in a private
  -- admins-only project; reading/managing existing feedback is a separate gate.
  IF v_role IS NULL THEN RAISE EXCEPTION 'forbidden'; END IF;
  IF p_visibility IS NULL OR p_visibility NOT IN ('shared','internal') THEN RAISE EXCEPTION 'invalid_visibility'; END IF;
  PERFORM public.cloud_require_write(public.cloud_owner(p_project));
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

--> statement-breakpoint

CREATE FUNCTION public.record_deleted_extension_feedback() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF OLD.source='extension' THEN
    INSERT INTO public.deleted_extension_feedback(id,actor_id,screenshot_storage_path,cleanup_after)
      VALUES(OLD.id,OLD.created_by_user_id,OLD.screenshot_storage_path,
        greatest(now(),coalesce((SELECT expires_at + interval '15 minutes' FROM public.extension_screenshot_upload_windows
          WHERE comment_id=OLD.id),now())));
  END IF;
  RETURN OLD;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER record_deleted_extension_feedback BEFORE DELETE ON public.comments
  FOR EACH ROW EXECUTE FUNCTION public.record_deleted_extension_feedback();
--> statement-breakpoint
CREATE FUNCTION public.reject_deleted_feedback_reuse() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF EXISTS(SELECT 1 FROM public.deleted_extension_feedback WHERE id=NEW.id) THEN
    RAISE EXCEPTION 'feedback_deleted';
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
-- AFTER INSERT also observes a concurrent DELETE after a unique-index wait.
CREATE TRIGGER reject_deleted_feedback_reuse AFTER INSERT ON public.comments
  FOR EACH ROW EXECUTE FUNCTION public.reject_deleted_feedback_reuse();
--> statement-breakpoint
CREATE FUNCTION public.delete_actor_extension_feedback(p_actor uuid,p_id uuid) RETURNS jsonb
LANGUAGE plpgsql SET search_path = '' AS $$
DECLARE v_path text;
BEGIN
  DELETE FROM public.comments WHERE id=p_id AND source='extension' AND created_by_user_id=p_actor
    RETURNING screenshot_storage_path INTO v_path;
  IF FOUND THEN RETURN jsonb_build_object('path',v_path); END IF;
  SELECT screenshot_storage_path INTO v_path FROM public.deleted_extension_feedback WHERE id=p_id AND actor_id=p_actor;
  IF NOT FOUND THEN RETURN NULL; END IF;
  RETURN jsonb_build_object('path',v_path);
END;
$$;
--> statement-breakpoint
CREATE FUNCTION public.get_deleted_extension_feedback(p_actor uuid,p_id uuid) RETURNS jsonb
LANGUAGE sql SET search_path = '' AS $$
  SELECT jsonb_build_object('path',screenshot_storage_path) FROM public.deleted_extension_feedback WHERE id=p_id AND actor_id=p_actor
$$;
--> statement-breakpoint
CREATE FUNCTION public.register_extension_screenshot_upload(p_actor uuid,p_id uuid,p_path text,p_expires timestamptz) RETURNS void
LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  IF p_expires IS NULL OR p_expires<=now() OR p_expires>now()+interval '3 hours' THEN RAISE EXCEPTION 'invalid_upload_expiry'; END IF;
  -- Same row-first order as DELETE. The upload window commits before deletion
  -- can copy its deadline, and registration cannot succeed after deletion.
  PERFORM 1 FROM public.comments WHERE id=p_id AND source='extension' AND created_by_user_id=p_actor
    AND screenshot_storage_path=p_path FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'feedback_deleted'; END IF;
  INSERT INTO public.extension_screenshot_upload_windows(comment_id,expires_at) VALUES(p_id,p_expires)
    ON CONFLICT(comment_id) DO UPDATE SET expires_at=greatest(extension_screenshot_upload_windows.expires_at,EXCLUDED.expires_at);
END;
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION public.record_deleted_extension_feedback(),public.reject_deleted_feedback_reuse(),
  public.delete_actor_extension_feedback(uuid,uuid),public.get_deleted_extension_feedback(uuid,uuid),
  public.register_extension_screenshot_upload(uuid,uuid,text,timestamptz) FROM PUBLIC,anon,authenticated;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.delete_actor_extension_feedback(uuid,uuid),public.get_deleted_extension_feedback(uuid,uuid),
  public.register_extension_screenshot_upload(uuid,uuid,text,timestamptz) TO service_role;
