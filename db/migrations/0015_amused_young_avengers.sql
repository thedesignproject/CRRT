CREATE TABLE "audit_candidates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"audit_id" uuid NOT NULL,
	"candidate_key" text NOT NULL,
	"payload" jsonb NOT NULL,
	"decision" text DEFAULT 'pending' NOT NULL,
	"rejection_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "audit_candidates_decision_check" CHECK ("audit_candidates"."decision" in ('pending', 'admitted', 'rejected', 'merged'))
);
--> statement-breakpoint
ALTER TABLE "audit_candidates" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "audit_events" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "audit_events_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"audit_id" uuid NOT NULL,
	"event_type" text NOT NULL,
	"actor_type" text NOT NULL,
	"actor_id" text,
	"idempotency_key" text NOT NULL,
	"stage" text,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "audit_events_type_check" CHECK ("audit_events"."event_type" in (
        'audit.queued', 'audit.stage.started', 'audit.stage.rate_limited', 'audit.evidence.captured',
        'audit.stage.completed', 'audit.coverage.partial', 'audit.finding.verified',
        'audit.completed', 'audit.failed', 'audit.cancelled'
      )),
	CONSTRAINT "audit_events_actor_type_check" CHECK ("audit_events"."actor_type" in ('system', 'explorer', 'critic', 'verifier', 'user'))
);
--> statement-breakpoint
ALTER TABLE "audit_events" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "audit_evidence" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"audit_id" uuid NOT NULL,
	"evidence_key" text NOT NULL,
	"source" text NOT NULL,
	"signal_key" text NOT NULL,
	"kind" text NOT NULL,
	"route" text NOT NULL,
	"element" text,
	"observation" text NOT NULL,
	"confidence" double precision NOT NULL,
	"direct" boolean NOT NULL,
	"provenance" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"artifact" jsonb,
	"capture" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "audit_evidence_source_check" CHECK ("audit_evidence"."source" in ('customer-rule', 'design-system', 'repository', 'url', 'heuristic')),
	CONSTRAINT "audit_evidence_confidence_check" CHECK ("audit_evidence"."confidence" >= 0 and "audit_evidence"."confidence" <= 1)
);
--> statement-breakpoint
ALTER TABLE "audit_evidence" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "audit_findings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"audit_id" uuid NOT NULL,
	"finding_key" text NOT NULL,
	"rank" integer NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"admitted_by" text NOT NULL,
	"payload" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "audit_findings_rank_check" CHECK ("audit_findings"."rank" between 1 and 5),
	CONSTRAINT "audit_findings_status_check" CHECK ("audit_findings"."status" = 'open'),
	CONSTRAINT "audit_findings_admitted_by_check" CHECK ("audit_findings"."admitted_by" in ('direct-evidence', 'independent-signals'))
);
--> statement-breakpoint
ALTER TABLE "audit_findings" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "audit_rate_limit_windows" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"identity_kind" text NOT NULL,
	"identity_hash" text NOT NULL,
	"window_started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"request_count" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "audit_rate_limit_windows_identity_kind_check" CHECK ("audit_rate_limit_windows"."identity_kind" in ('session', 'ip')),
	CONSTRAINT "audit_rate_limit_windows_request_count_check" CHECK ("audit_rate_limit_windows"."request_count" >= 0)
);
--> statement-breakpoint
ALTER TABLE "audit_rate_limit_windows" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "audit_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_key" text,
	"creator_user_id" uuid,
	"owner_kind" text NOT NULL,
	"start_idempotency_key" text NOT NULL,
	"capability_token_hash" text,
	"anonymous_session_hash" text,
	"anonymous_ip_hash" text,
	"input_url" text NOT NULL,
	"normalized_url" text NOT NULL,
	"mode" text DEFAULT 'live' NOT NULL,
	"status" text DEFAULT 'queued' NOT NULL,
	"current_stage" text DEFAULT 'queued' NOT NULL,
	"workflow_run_id" text,
	"budgets" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"coverage" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"unavailable_sources" text[] DEFAULT '{}' NOT NULL,
	"source_snapshot" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"error_code" text,
	"error_message" text,
	"stage_lease_token" uuid,
	"stage_lease_expires_at" timestamp with time zone,
	"retry_not_before" timestamp with time zone,
	"stage_attempt" integer DEFAULT 0 NOT NULL,
	"started_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"cancelled_at" timestamp with time zone,
	"expires_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "audit_runs_workflow_run_id_unique" UNIQUE("workflow_run_id"),
	CONSTRAINT "audit_runs_owner_kind_check" CHECK ("audit_runs"."owner_kind" in ('anonymous', 'project')),
	CONSTRAINT "audit_runs_owner_shape_check" CHECK ((
        ("audit_runs"."owner_kind" = 'project' and "audit_runs"."project_key" is not null and "audit_runs"."creator_user_id" is not null)
        or
        ("audit_runs"."owner_kind" = 'anonymous' and "audit_runs"."project_key" is null and "audit_runs"."creator_user_id" is null
          and "audit_runs"."capability_token_hash" is not null and "audit_runs"."anonymous_session_hash" is not null
          and "audit_runs"."anonymous_ip_hash" is not null and "audit_runs"."expires_at" is not null)
      )),
	CONSTRAINT "audit_runs_mode_check" CHECK ("audit_runs"."mode" in ('local-fixture', 'live')),
	CONSTRAINT "audit_runs_status_check" CHECK ("audit_runs"."status" in ('queued', 'running', 'completed', 'partial', 'failed', 'cancelled')),
	CONSTRAINT "audit_runs_stage_check" CHECK ("audit_runs"."current_stage" in ('queued', 'explorer', 'critic', 'verifier', 'completed', 'failed', 'cancelled')),
	CONSTRAINT "audit_runs_lease_shape_check" CHECK (("audit_runs"."stage_lease_token" is null) = ("audit_runs"."stage_lease_expires_at" is null))
);
--> statement-breakpoint
ALTER TABLE "audit_runs" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "audit_candidates" ADD CONSTRAINT "audit_candidates_audit_id_audit_runs_id_fk" FOREIGN KEY ("audit_id") REFERENCES "public"."audit_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_events" ADD CONSTRAINT "audit_events_audit_id_audit_runs_id_fk" FOREIGN KEY ("audit_id") REFERENCES "public"."audit_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_evidence" ADD CONSTRAINT "audit_evidence_audit_id_audit_runs_id_fk" FOREIGN KEY ("audit_id") REFERENCES "public"."audit_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_findings" ADD CONSTRAINT "audit_findings_audit_id_audit_runs_id_fk" FOREIGN KEY ("audit_id") REFERENCES "public"."audit_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_runs" ADD CONSTRAINT "audit_runs_project_key_projects_public_key_fk" FOREIGN KEY ("project_key") REFERENCES "public"."projects"("public_key") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "audit_candidates_audit_key_unique" ON "audit_candidates" USING btree ("audit_id","candidate_key");--> statement-breakpoint
CREATE INDEX "audit_candidates_audit_created_idx" ON "audit_candidates" USING btree ("audit_id","created_at");--> statement-breakpoint
CREATE INDEX "audit_events_audit_sequence_idx" ON "audit_events" USING btree ("audit_id","id");--> statement-breakpoint
CREATE UNIQUE INDEX "audit_events_idempotency_unique" ON "audit_events" USING btree ("audit_id","idempotency_key");--> statement-breakpoint
CREATE UNIQUE INDEX "audit_evidence_audit_key_unique" ON "audit_evidence" USING btree ("audit_id","evidence_key");--> statement-breakpoint
CREATE INDEX "audit_evidence_audit_created_idx" ON "audit_evidence" USING btree ("audit_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "audit_findings_audit_key_unique" ON "audit_findings" USING btree ("audit_id","finding_key");--> statement-breakpoint
CREATE UNIQUE INDEX "audit_findings_audit_rank_unique" ON "audit_findings" USING btree ("audit_id","rank");--> statement-breakpoint
CREATE UNIQUE INDEX "audit_rate_limit_windows_identity_unique" ON "audit_rate_limit_windows" USING btree ("identity_kind","identity_hash");--> statement-breakpoint
CREATE INDEX "audit_rate_limit_windows_window_idx" ON "audit_rate_limit_windows" USING btree ("window_started_at");--> statement-breakpoint
CREATE INDEX "audit_runs_project_created_idx" ON "audit_runs" USING btree ("project_key","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "audit_runs_anonymous_session_created_idx" ON "audit_runs" USING btree ("anonymous_session_hash","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "audit_runs_anonymous_ip_created_idx" ON "audit_runs" USING btree ("anonymous_ip_hash","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "audit_runs_status_updated_idx" ON "audit_runs" USING btree ("status","updated_at");--> statement-breakpoint
CREATE INDEX "audit_runs_expires_idx" ON "audit_runs" USING btree ("expires_at");--> statement-breakpoint
CREATE UNIQUE INDEX "audit_runs_project_start_unique" ON "audit_runs" USING btree ("creator_user_id","start_idempotency_key") WHERE "audit_runs"."owner_kind" = 'project';--> statement-breakpoint
CREATE UNIQUE INDEX "audit_runs_anonymous_start_unique" ON "audit_runs" USING btree ("anonymous_session_hash","start_idempotency_key") WHERE "audit_runs"."owner_kind" = 'anonymous';
--> statement-breakpoint

CREATE FUNCTION public.create_audit_run(
  p_owner_kind text,
  p_project_key text,
  p_creator_user_id uuid,
  p_start_idempotency_key text,
  p_capability_token_hash text,
  p_anonymous_session_hash text,
  p_anonymous_ip_hash text,
  p_input_url text,
  p_normalized_url text,
  p_mode text,
  p_budgets jsonb,
  p_coverage jsonb,
  p_source_snapshot jsonb,
  p_expires_at timestamptz,
  p_session_limit integer DEFAULT 1,
  p_ip_limit integer DEFAULT 3
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_audit_id uuid;
  v_existing_status text;
  v_existing_expires_at timestamptz;
  v_now timestamptz := now();
  v_session public.audit_rate_limit_windows%ROWTYPE;
  v_ip public.audit_rate_limit_windows%ROWTYPE;
  v_retry_at timestamptz;
BEGIN
  IF p_owner_kind NOT IN ('anonymous', 'project')
    OR nullif(btrim(p_start_idempotency_key), '') IS NULL
    OR nullif(btrim(p_input_url), '') IS NULL
    OR nullif(btrim(p_normalized_url), '') IS NULL THEN
    RETURN jsonb_build_object('status', 'invalid_input');
  END IF;

  IF p_owner_kind = 'project' THEN
    IF p_project_key IS NULL OR p_creator_user_id IS NULL THEN
      RETURN jsonb_build_object('status', 'invalid_input');
    END IF;
    PERFORM pg_advisory_xact_lock(hashtextextended(
      'audit-project:' || p_creator_user_id::text || ':' || p_start_idempotency_key,
      0
    ));
    SELECT run.id, run.status, run.expires_at
    INTO v_audit_id, v_existing_status, v_existing_expires_at
    FROM public.audit_runs AS run
    WHERE run.creator_user_id = p_creator_user_id
      AND run.start_idempotency_key = p_start_idempotency_key
      AND run.owner_kind = 'project';
  ELSE
    IF p_project_key IS NOT NULL OR p_creator_user_id IS NOT NULL
      OR p_capability_token_hash IS NULL OR p_anonymous_session_hash IS NULL
      OR p_anonymous_ip_hash IS NULL OR p_expires_at IS NULL THEN
      RETURN jsonb_build_object('status', 'invalid_input');
    END IF;
    PERFORM pg_advisory_xact_lock(hashtextextended(
      'audit-session:' || p_anonymous_session_hash,
      0
    ));
    PERFORM pg_advisory_xact_lock(hashtextextended(
      'audit-ip:' || p_anonymous_ip_hash,
      0
    ));
    SELECT run.id, run.status, run.expires_at
    INTO v_audit_id, v_existing_status, v_existing_expires_at
    FROM public.audit_runs AS run
    WHERE run.anonymous_session_hash = p_anonymous_session_hash
      AND run.start_idempotency_key = p_start_idempotency_key
      AND run.owner_kind = 'anonymous';
  END IF;

  IF v_audit_id IS NOT NULL THEN
    RETURN jsonb_build_object(
      'status', 'existing', 'auditId', v_audit_id,
      'runStatus', v_existing_status, 'expiresAt', v_existing_expires_at
    );
  END IF;

  IF p_owner_kind = 'anonymous' THEN
    SELECT rate.* INTO v_session
    FROM public.audit_rate_limit_windows AS rate
    WHERE rate.identity_kind = 'session' AND rate.identity_hash = p_anonymous_session_hash
    FOR UPDATE;
    SELECT rate.* INTO v_ip
    FROM public.audit_rate_limit_windows AS rate
    WHERE rate.identity_kind = 'ip' AND rate.identity_hash = p_anonymous_ip_hash
    FOR UPDATE;

    IF v_session.id IS NOT NULL
      AND v_session.window_started_at > v_now - interval '24 hours'
      AND v_session.request_count >= p_session_limit THEN
      v_retry_at := v_session.window_started_at + interval '24 hours';
      RETURN jsonb_build_object('status', 'rate_limited', 'scope', 'session', 'retryAt', v_retry_at);
    END IF;
    IF v_ip.id IS NOT NULL
      AND v_ip.window_started_at > v_now - interval '24 hours'
      AND v_ip.request_count >= p_ip_limit THEN
      v_retry_at := v_ip.window_started_at + interval '24 hours';
      RETURN jsonb_build_object('status', 'rate_limited', 'scope', 'ip', 'retryAt', v_retry_at);
    END IF;

    INSERT INTO public.audit_rate_limit_windows (
      identity_kind, identity_hash, window_started_at, request_count, updated_at
    ) VALUES ('session', p_anonymous_session_hash, v_now, 1, v_now)
    ON CONFLICT (identity_kind, identity_hash) DO UPDATE SET
      window_started_at = CASE
        WHEN public.audit_rate_limit_windows.window_started_at <= v_now - interval '24 hours'
          THEN v_now ELSE public.audit_rate_limit_windows.window_started_at END,
      request_count = CASE
        WHEN public.audit_rate_limit_windows.window_started_at <= v_now - interval '24 hours'
          THEN 1 ELSE public.audit_rate_limit_windows.request_count + 1 END,
      updated_at = v_now;
    INSERT INTO public.audit_rate_limit_windows (
      identity_kind, identity_hash, window_started_at, request_count, updated_at
    ) VALUES ('ip', p_anonymous_ip_hash, v_now, 1, v_now)
    ON CONFLICT (identity_kind, identity_hash) DO UPDATE SET
      window_started_at = CASE
        WHEN public.audit_rate_limit_windows.window_started_at <= v_now - interval '24 hours'
          THEN v_now ELSE public.audit_rate_limit_windows.window_started_at END,
      request_count = CASE
        WHEN public.audit_rate_limit_windows.window_started_at <= v_now - interval '24 hours'
          THEN 1 ELSE public.audit_rate_limit_windows.request_count + 1 END,
      updated_at = v_now;
  END IF;

  INSERT INTO public.audit_runs (
    project_key, creator_user_id, owner_kind, start_idempotency_key,
    capability_token_hash, anonymous_session_hash, anonymous_ip_hash,
    input_url, normalized_url, mode, budgets, coverage, source_snapshot, expires_at
  ) VALUES (
    p_project_key, p_creator_user_id, p_owner_kind, p_start_idempotency_key,
    p_capability_token_hash, p_anonymous_session_hash, p_anonymous_ip_hash,
    p_input_url, p_normalized_url, p_mode, coalesce(p_budgets, '{}'::jsonb),
    coalesce(p_coverage, '{}'::jsonb), coalesce(p_source_snapshot, '{}'::jsonb), p_expires_at
  ) RETURNING id INTO v_audit_id;

  INSERT INTO public.audit_events (
    audit_id, event_type, actor_type, idempotency_key, stage, payload
  ) VALUES (
    v_audit_id, 'audit.queued', 'system', 'audit:queued', 'queued', '{}'::jsonb
  );

  RETURN jsonb_build_object('status', 'created', 'auditId', v_audit_id);
END;
$$;
--> statement-breakpoint

CREATE FUNCTION public.acquire_audit_stage_lease(
  p_audit_id uuid,
  p_stage text,
  p_lease_seconds integer DEFAULT 120
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_run public.audit_runs%ROWTYPE;
  v_token uuid := gen_random_uuid();
  v_attempt integer;
BEGIN
  IF p_stage NOT IN ('explorer', 'critic', 'verifier') OR p_lease_seconds < 1 THEN
    RETURN jsonb_build_object('status', 'invalid_input');
  END IF;
  SELECT run.* INTO v_run FROM public.audit_runs AS run WHERE run.id = p_audit_id FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('status', 'not_found'); END IF;
  IF v_run.status IN ('completed', 'partial', 'failed', 'cancelled') THEN
    RETURN jsonb_build_object('status', 'terminal', 'runStatus', v_run.status);
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.audit_events AS event
    WHERE event.audit_id = p_audit_id
      AND event.event_type = 'audit.stage.completed'
      AND event.stage = p_stage
  ) THEN
    RETURN jsonb_build_object('status', 'already_completed');
  END IF;
  IF (p_stage = 'critic' AND NOT EXISTS (
    SELECT 1 FROM public.audit_events AS event
    WHERE event.audit_id = p_audit_id AND event.event_type = 'audit.stage.completed' AND event.stage = 'explorer'
  )) OR (p_stage = 'verifier' AND NOT EXISTS (
    SELECT 1 FROM public.audit_events AS event
    WHERE event.audit_id = p_audit_id AND event.event_type = 'audit.stage.completed' AND event.stage = 'critic'
  )) THEN
    RETURN jsonb_build_object('status', 'not_ready');
  END IF;
  IF v_run.retry_not_before IS NOT NULL AND v_run.retry_not_before > now() THEN
    RETURN jsonb_build_object('status', 'deferred', 'retryAt', v_run.retry_not_before);
  END IF;
  IF v_run.stage_lease_expires_at IS NOT NULL AND v_run.stage_lease_expires_at > now() THEN
    RETURN jsonb_build_object('status', 'busy', 'expiresAt', v_run.stage_lease_expires_at);
  END IF;

  v_attempt := v_run.stage_attempt + 1;
  UPDATE public.audit_runs SET
    status = 'running', current_stage = p_stage, stage_lease_token = v_token,
    stage_lease_expires_at = now() + make_interval(secs => p_lease_seconds),
    retry_not_before = NULL,
    stage_attempt = v_attempt, started_at = coalesce(started_at, now()), updated_at = now()
  WHERE id = p_audit_id;
  INSERT INTO public.audit_events (
    audit_id, event_type, actor_type, idempotency_key, stage, payload
  ) VALUES (
    p_audit_id, 'audit.stage.started', p_stage,
    'stage:' || p_stage || ':attempt:' || v_attempt || ':started', p_stage,
    jsonb_build_object('attempt', v_attempt)
  ) ON CONFLICT (audit_id, idempotency_key) DO NOTHING;
  RETURN jsonb_build_object('status', 'acquired', 'leaseToken', v_token, 'attempt', v_attempt);
END;
$$;
--> statement-breakpoint

CREATE FUNCTION public.renew_audit_stage_lease(
  p_audit_id uuid,
  p_stage text,
  p_lease_token uuid,
  p_lease_seconds integer DEFAULT 60
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_run public.audit_runs%ROWTYPE;
  v_expires_at timestamptz;
BEGIN
  IF p_stage NOT IN ('explorer', 'critic', 'verifier') OR p_lease_seconds < 1 OR p_lease_seconds > 300 THEN
    RETURN jsonb_build_object('status', 'invalid_input');
  END IF;
  SELECT run.* INTO v_run FROM public.audit_runs AS run WHERE run.id = p_audit_id FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('status', 'not_found'); END IF;
  IF v_run.status IN ('completed', 'partial', 'failed', 'cancelled') THEN
    RETURN jsonb_build_object('status', 'terminal', 'runStatus', v_run.status);
  END IF;
  IF v_run.current_stage <> p_stage OR v_run.stage_lease_token IS DISTINCT FROM p_lease_token THEN
    RETURN jsonb_build_object('status', 'lease_mismatch');
  END IF;
  IF v_run.stage_lease_expires_at IS NULL OR v_run.stage_lease_expires_at <= now() THEN
    RETURN jsonb_build_object('status', 'lease_expired');
  END IF;
  v_expires_at := now() + make_interval(secs => p_lease_seconds);
  UPDATE public.audit_runs SET stage_lease_expires_at = v_expires_at, updated_at = now()
  WHERE id = p_audit_id;
  RETURN jsonb_build_object('status', 'renewed', 'expiresAt', v_expires_at);
END;
$$;
--> statement-breakpoint

CREATE FUNCTION public.complete_audit_stage(
  p_audit_id uuid,
  p_stage text,
  p_lease_token uuid,
  p_payload jsonb DEFAULT '{}'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_run public.audit_runs%ROWTYPE;
  v_item jsonb;
BEGIN
  IF p_stage NOT IN ('explorer', 'critic') THEN
    RETURN jsonb_build_object('status', 'invalid_input');
  END IF;
  SELECT run.* INTO v_run FROM public.audit_runs AS run WHERE run.id = p_audit_id FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('status', 'not_found'); END IF;
  IF v_run.status = 'cancelled' THEN RETURN jsonb_build_object('status', 'cancelled'); END IF;
  IF v_run.status IN ('completed', 'partial', 'failed') THEN
    RETURN jsonb_build_object('status', 'terminal', 'runStatus', v_run.status);
  END IF;
  IF v_run.current_stage <> p_stage OR v_run.stage_lease_token IS DISTINCT FROM p_lease_token THEN
    RETURN jsonb_build_object('status', 'lease_mismatch');
  END IF;
  IF v_run.stage_lease_expires_at IS NULL OR v_run.stage_lease_expires_at <= now() THEN
    RETURN jsonb_build_object('status', 'lease_expired');
  END IF;
  IF p_stage = 'explorer' THEN
    IF jsonb_typeof(coalesce(p_payload->'evidence', '[]'::jsonb)) <> 'array'
      OR jsonb_typeof(coalesce(p_payload->'coverage', '{}'::jsonb)) <> 'object'
      OR EXISTS (
        SELECT 1 FROM jsonb_array_elements(coalesce(p_payload->'evidence', '[]'::jsonb)) AS evidence(value)
        WHERE nullif(btrim(evidence.value->>'id'), '') IS NULL
          OR nullif(btrim(evidence.value->>'source'), '') IS NULL
          OR nullif(btrim(evidence.value->>'signalKey'), '') IS NULL
          OR nullif(btrim(evidence.value->>'location'), '') IS NULL
          OR nullif(btrim(evidence.value->>'observation'), '') IS NULL
      ) OR EXISTS (
        SELECT 1 FROM jsonb_array_elements(coalesce(p_payload->'evidence', '[]'::jsonb)) AS evidence(value)
        GROUP BY evidence.value->>'id' HAVING count(*) > 1
      ) THEN
      RETURN jsonb_build_object('status', 'invalid_output');
    END IF;
    DELETE FROM public.audit_evidence WHERE audit_id = p_audit_id;
    FOR v_item IN SELECT value FROM jsonb_array_elements(coalesce(p_payload->'evidence', '[]'::jsonb)) LOOP
      INSERT INTO public.audit_evidence (
        audit_id, evidence_key, source, signal_key, kind, route, element,
        observation, confidence, direct, provenance, artifact, capture
      ) VALUES (
        p_audit_id, v_item->>'id', v_item->>'source', v_item->>'signalKey',
        coalesce(nullif(v_item->>'kind', ''), 'observable'),
        coalesce(nullif(v_item->>'route', ''), v_item->>'location'), nullif(v_item->>'element', ''),
        v_item->>'observation', (v_item->>'confidence')::double precision,
        (v_item->>'direct')::boolean, coalesce(v_item->'provenance', '{}'::jsonb),
        v_item->'artifact', coalesce(v_item->'capture', '{}'::jsonb)
      );
    END LOOP;
    UPDATE public.audit_runs SET
      coverage = coalesce(p_payload->'coverage', coverage),
      unavailable_sources = coalesce(ARRAY(
        SELECT jsonb_array_elements_text(p_payload->'coverage'->'unavailableSources')
      ), '{}'::text[])
    WHERE id = p_audit_id;
    INSERT INTO public.audit_events (
      audit_id, event_type, actor_type, idempotency_key, stage, payload
    ) VALUES (
      p_audit_id, 'audit.evidence.captured', 'explorer',
      'stage:explorer:attempt:' || v_run.stage_attempt || ':evidence', 'explorer',
      jsonb_build_object('count', jsonb_array_length(coalesce(p_payload->'evidence', '[]'::jsonb)))
    ) ON CONFLICT (audit_id, idempotency_key) DO NOTHING;
  ELSIF p_stage = 'critic' THEN
    IF jsonb_typeof(coalesce(p_payload->'candidates', '[]'::jsonb)) <> 'array'
      OR EXISTS (
        SELECT 1 FROM jsonb_array_elements(coalesce(p_payload->'candidates', '[]'::jsonb)) AS candidate(value)
        WHERE nullif(btrim(candidate.value->>'id'), '') IS NULL
      ) OR EXISTS (
        SELECT 1 FROM jsonb_array_elements(coalesce(p_payload->'candidates', '[]'::jsonb)) AS candidate(value)
        GROUP BY candidate.value->>'id' HAVING count(*) > 1
      ) THEN
      RETURN jsonb_build_object('status', 'invalid_output');
    END IF;
    DELETE FROM public.audit_candidates WHERE audit_id = p_audit_id;
    INSERT INTO public.audit_candidates (audit_id, candidate_key, payload)
    SELECT p_audit_id, candidate.value->>'id', candidate.value
    FROM jsonb_array_elements(coalesce(p_payload->'candidates', '[]'::jsonb)) AS candidate(value);
  END IF;
  UPDATE public.audit_runs SET
    stage_lease_token = NULL, stage_lease_expires_at = NULL, retry_not_before = NULL, updated_at = now()
  WHERE id = p_audit_id;
  INSERT INTO public.audit_events (
    audit_id, event_type, actor_type, idempotency_key, stage, payload
  ) VALUES (
    p_audit_id, 'audit.stage.completed', p_stage,
    'stage:' || p_stage || ':attempt:' || v_run.stage_attempt || ':completed', p_stage,
    CASE p_stage
      WHEN 'explorer' THEN jsonb_build_object('evidenceCount', jsonb_array_length(coalesce(p_payload->'evidence', '[]'::jsonb)))
      WHEN 'critic' THEN jsonb_build_object('candidateCount', jsonb_array_length(coalesce(p_payload->'candidates', '[]'::jsonb)))
      ELSE coalesce(p_payload, '{}'::jsonb)
    END
  ) ON CONFLICT (audit_id, idempotency_key) DO NOTHING;
  RETURN jsonb_build_object('status', 'completed');
END;
$$;
--> statement-breakpoint

CREATE FUNCTION public.defer_audit_stage_retry(
  p_audit_id uuid,
  p_stage text,
  p_lease_token uuid,
  p_retry_at timestamptz
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_run public.audit_runs%ROWTYPE;
  v_retry_count integer;
  v_retry_at timestamptz;
BEGIN
  IF p_stage NOT IN ('critic', 'verifier')
    OR p_retry_at <= now()
    OR p_retry_at > now() + interval '15 minutes' THEN
    RETURN jsonb_build_object('status', 'invalid_input');
  END IF;
  SELECT run.* INTO v_run FROM public.audit_runs AS run WHERE run.id = p_audit_id FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('status', 'not_found'); END IF;
  IF v_run.status IN ('completed', 'partial', 'failed', 'cancelled') THEN
    RETURN jsonb_build_object('status', 'terminal', 'runStatus', v_run.status);
  END IF;
  IF v_run.current_stage <> p_stage OR v_run.stage_lease_token IS DISTINCT FROM p_lease_token THEN
    RETURN jsonb_build_object('status', 'lease_mismatch');
  END IF;
  IF v_run.stage_lease_expires_at IS NULL OR v_run.stage_lease_expires_at <= now() THEN
    RETURN jsonb_build_object('status', 'lease_expired');
  END IF;

  SELECT count(*)::integer INTO v_retry_count
  FROM public.audit_events AS event
  WHERE event.audit_id = p_audit_id
    AND event.event_type = 'audit.stage.rate_limited'
    AND event.stage = p_stage;
  v_retry_at := greatest(
    p_retry_at,
    now() + make_interval(secs => least(240, (60 * power(2, v_retry_count))::integer))
  );

  UPDATE public.audit_runs SET
    stage_lease_token = NULL, stage_lease_expires_at = NULL,
    retry_not_before = v_retry_at, updated_at = now()
  WHERE id = p_audit_id;
  INSERT INTO public.audit_events (
    audit_id, event_type, actor_type, idempotency_key, stage, payload
  ) VALUES (
    p_audit_id, 'audit.stage.rate_limited', p_stage,
    'stage:' || p_stage || ':attempt:' || v_run.stage_attempt || ':rate-limited', p_stage,
    jsonb_build_object('retryAt', v_retry_at)
  ) ON CONFLICT (audit_id, idempotency_key) DO NOTHING;
  RETURN jsonb_build_object('status', 'deferred', 'retryAt', v_retry_at);
END;
$$;
--> statement-breakpoint

CREATE FUNCTION public.finish_audit_partial(
  p_audit_id uuid,
  p_stage text,
  p_lease_token uuid,
  p_coverage jsonb,
  p_error_code text,
  p_error_message text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_run public.audit_runs%ROWTYPE;
BEGIN
  IF p_stage NOT IN ('critic', 'verifier')
    OR jsonb_typeof(coalesce(p_coverage, '{}'::jsonb)) <> 'object'
    OR nullif(btrim(p_error_code), '') IS NULL
    OR nullif(btrim(p_error_message), '') IS NULL THEN
    RETURN jsonb_build_object('status', 'invalid_input');
  END IF;
  SELECT run.* INTO v_run FROM public.audit_runs AS run WHERE run.id = p_audit_id FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('status', 'not_found'); END IF;
  IF v_run.status IN ('completed', 'partial', 'failed', 'cancelled') THEN
    RETURN jsonb_build_object('status', 'unchanged', 'runStatus', v_run.status);
  END IF;
  IF v_run.current_stage <> p_stage OR v_run.stage_lease_token IS DISTINCT FROM p_lease_token THEN
    RETURN jsonb_build_object('status', 'lease_mismatch');
  END IF;
  IF v_run.stage_lease_expires_at IS NULL OR v_run.stage_lease_expires_at <= now() THEN
    RETURN jsonb_build_object('status', 'lease_expired');
  END IF;

  DELETE FROM public.audit_findings WHERE audit_id = p_audit_id;
  UPDATE public.audit_runs SET
    status = 'partial', current_stage = 'completed', coverage = coalesce(p_coverage, coverage),
    error_code = p_error_code, error_message = p_error_message, completed_at = now(),
    stage_lease_token = NULL, stage_lease_expires_at = NULL, retry_not_before = NULL, updated_at = now()
  WHERE id = p_audit_id;
  INSERT INTO public.audit_events (
    audit_id, event_type, actor_type, idempotency_key, stage, payload
  ) VALUES (
    p_audit_id, 'audit.coverage.partial', 'system', 'audit:partial:' || p_error_code, 'completed',
    jsonb_build_object('findingCount', 0, 'reason', p_error_message, 'interruptedStage', p_stage)
  ) ON CONFLICT (audit_id, idempotency_key) DO NOTHING;
  RETURN jsonb_build_object('status', 'partial', 'findingCount', 0);
END;
$$;
--> statement-breakpoint

CREATE FUNCTION public.cancel_audit_run(p_audit_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_run public.audit_runs%ROWTYPE;
BEGIN
  SELECT run.* INTO v_run FROM public.audit_runs AS run WHERE run.id = p_audit_id FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('status', 'not_found'); END IF;
  IF v_run.status IN ('completed', 'partial', 'failed', 'cancelled') THEN
    RETURN jsonb_build_object('status', 'unchanged', 'runStatus', v_run.status);
  END IF;
  UPDATE public.audit_runs SET
    status = 'cancelled', current_stage = 'cancelled', cancelled_at = now(),
    stage_lease_token = NULL, stage_lease_expires_at = NULL, retry_not_before = NULL, updated_at = now()
  WHERE id = p_audit_id;
  INSERT INTO public.audit_events (
    audit_id, event_type, actor_type, idempotency_key, stage, payload
  ) VALUES (
    p_audit_id, 'audit.cancelled', 'user', 'audit:cancelled', 'cancelled', '{}'::jsonb
  ) ON CONFLICT (audit_id, idempotency_key) DO NOTHING;
  RETURN jsonb_build_object('status', 'cancelled');
END;
$$;
--> statement-breakpoint

CREATE FUNCTION public.mark_audit_run_failed(
  p_audit_id uuid,
  p_error_code text,
  p_error_message text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_run public.audit_runs%ROWTYPE;
BEGIN
  SELECT run.* INTO v_run FROM public.audit_runs AS run WHERE run.id = p_audit_id FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('status', 'not_found'); END IF;
  IF v_run.status NOT IN ('queued', 'running', 'failed') THEN
    RETURN jsonb_build_object('status', 'unchanged', 'runStatus', v_run.status);
  END IF;
  IF v_run.status <> 'failed' THEN
    UPDATE public.audit_runs SET
      status = 'failed', current_stage = 'failed', error_code = p_error_code,
      error_message = p_error_message, completed_at = now(),
      stage_lease_token = NULL, stage_lease_expires_at = NULL, retry_not_before = NULL, updated_at = now()
    WHERE id = p_audit_id;
  END IF;
  INSERT INTO public.audit_events (
    audit_id, event_type, actor_type, idempotency_key, stage, payload
  ) VALUES (
    p_audit_id, 'audit.failed', 'system', 'audit:failed', 'failed',
    jsonb_build_object('code', p_error_code, 'message', p_error_message)
  ) ON CONFLICT (audit_id, idempotency_key) DO NOTHING;
  RETURN jsonb_build_object('status', 'failed');
END;
$$;
--> statement-breakpoint

CREATE FUNCTION public.finish_audit_model_rate_limited(p_audit_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_run public.audit_runs%ROWTYPE;
  v_reason text := 'Model capacity was unavailable after delayed retries.';
BEGIN
  SELECT run.* INTO v_run FROM public.audit_runs AS run WHERE run.id = p_audit_id FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('status', 'not_found'); END IF;
  IF v_run.status IN ('completed', 'partial', 'failed', 'cancelled') THEN
    RETURN jsonb_build_object('status', 'unchanged', 'runStatus', v_run.status);
  END IF;
  IF v_run.status <> 'running'
    OR v_run.current_stage NOT IN ('critic', 'verifier')
    OR v_run.stage_lease_token IS NOT NULL
    OR NOT EXISTS (
      SELECT 1 FROM public.audit_events AS event
      WHERE event.audit_id = p_audit_id
        AND event.event_type = 'audit.stage.rate_limited'
        AND event.stage = v_run.current_stage
    ) THEN
    RETURN jsonb_build_object('status', 'invalid_state');
  END IF;

  DELETE FROM public.audit_findings WHERE audit_id = p_audit_id;
  UPDATE public.audit_runs SET
    status = 'partial', current_stage = 'completed',
    coverage = jsonb_set(coalesce(coverage, '{}'::jsonb), '{partialReason}', to_jsonb(v_reason), true),
    error_code = 'model_rate_limited', error_message = v_reason, completed_at = now(),
    stage_lease_token = NULL, stage_lease_expires_at = NULL, retry_not_before = NULL, updated_at = now()
  WHERE id = p_audit_id;
  INSERT INTO public.audit_events (
    audit_id, event_type, actor_type, idempotency_key, stage, payload
  ) VALUES (
    p_audit_id, 'audit.coverage.partial', 'system', 'audit:partial:model-rate-limit', 'completed',
    jsonb_build_object('findingCount', 0, 'reason', v_reason)
  ) ON CONFLICT (audit_id, idempotency_key) DO NOTHING;
  RETURN jsonb_build_object('status', 'partial', 'findingCount', 0);
END;
$$;
--> statement-breakpoint

CREATE FUNCTION public.finalize_audit_verification(
  p_audit_id uuid,
  p_lease_token uuid,
  p_findings jsonb,
  p_coverage jsonb,
  p_partial boolean DEFAULT false,
  p_error_code text DEFAULT NULL,
  p_error_message text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_run public.audit_runs%ROWTYPE;
  v_finding jsonb;
  v_rank integer := 0;
  v_status text := CASE WHEN p_partial THEN 'partial' ELSE 'completed' END;
BEGIN
  IF jsonb_typeof(coalesce(p_findings, '[]'::jsonb)) <> 'array'
    OR jsonb_array_length(coalesce(p_findings, '[]'::jsonb)) > 5 THEN
    RETURN jsonb_build_object('status', 'invalid_findings');
  END IF;
  IF EXISTS (
    SELECT 1
    FROM jsonb_array_elements(coalesce(p_findings, '[]'::jsonb)) AS finding(value)
    WHERE nullif(btrim(finding.value->>'findingKey'), '') IS NULL
      OR coalesce(finding.value->>'admittedBy', '') NOT IN ('direct-evidence', 'independent-signals')
  ) OR EXISTS (
    SELECT 1
    FROM jsonb_array_elements(coalesce(p_findings, '[]'::jsonb)) AS finding(value)
    GROUP BY finding.value->>'findingKey'
    HAVING count(*) > 1
  ) THEN
    RETURN jsonb_build_object('status', 'invalid_findings');
  END IF;
  SELECT run.* INTO v_run FROM public.audit_runs AS run WHERE run.id = p_audit_id FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('status', 'not_found'); END IF;
  IF v_run.status IN ('completed', 'partial') THEN
    RETURN jsonb_build_object('status', 'unchanged', 'runStatus', v_run.status);
  END IF;
  IF v_run.status = 'cancelled' THEN RETURN jsonb_build_object('status', 'cancelled'); END IF;
  IF v_run.current_stage <> 'verifier' OR v_run.stage_lease_token IS DISTINCT FROM p_lease_token THEN
    RETURN jsonb_build_object('status', 'lease_mismatch');
  END IF;
  IF v_run.stage_lease_expires_at IS NULL OR v_run.stage_lease_expires_at <= now() THEN
    RETURN jsonb_build_object('status', 'lease_expired');
  END IF;

  FOR v_finding IN SELECT value FROM jsonb_array_elements(coalesce(p_findings, '[]'::jsonb)) LOOP
    v_rank := v_rank + 1;
    INSERT INTO public.audit_findings (
      audit_id, finding_key, rank, status, admitted_by, payload
    ) VALUES (
      p_audit_id, v_finding->>'findingKey', v_rank, 'open',
      v_finding->>'admittedBy', coalesce(v_finding->'payload', '{}'::jsonb)
    ) ON CONFLICT (audit_id, finding_key) DO UPDATE SET
      rank = excluded.rank, admitted_by = excluded.admitted_by,
      payload = excluded.payload, updated_at = now();
    INSERT INTO public.audit_events (
      audit_id, event_type, actor_type, idempotency_key, stage, payload
    ) VALUES (
      p_audit_id, 'audit.finding.verified', 'verifier',
      'finding:' || (v_finding->>'findingKey') || ':verified', 'verifier',
      jsonb_build_object('findingKey', v_finding->>'findingKey', 'rank', v_rank)
    ) ON CONFLICT (audit_id, idempotency_key) DO NOTHING;
  END LOOP;

  DELETE FROM public.audit_findings WHERE audit_id = p_audit_id AND rank > v_rank;
  UPDATE public.audit_runs SET
    status = v_status, current_stage = 'completed', coverage = coalesce(p_coverage, coverage),
    error_code = p_error_code, error_message = p_error_message, completed_at = now(),
    stage_lease_token = NULL, stage_lease_expires_at = NULL, retry_not_before = NULL, updated_at = now()
  WHERE id = p_audit_id;
  INSERT INTO public.audit_events (
    audit_id, event_type, actor_type, idempotency_key, stage, payload
  ) VALUES (
    p_audit_id, CASE WHEN p_partial THEN 'audit.coverage.partial' ELSE 'audit.completed' END,
    'system', CASE WHEN p_partial THEN 'audit:partial' ELSE 'audit:completed' END,
    'completed', jsonb_build_object('findingCount', v_rank)
  ) ON CONFLICT (audit_id, idempotency_key) DO NOTHING;
  RETURN jsonb_build_object('status', v_status, 'findingCount', v_rank);
END;
$$;
--> statement-breakpoint

REVOKE ALL ON FUNCTION public.create_audit_run(text, text, uuid, text, text, text, text, text, text, text, jsonb, jsonb, jsonb, timestamptz, integer, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_audit_run(text, text, uuid, text, text, text, text, text, text, text, jsonb, jsonb, jsonb, timestamptz, integer, integer) TO service_role;
REVOKE ALL ON FUNCTION public.acquire_audit_stage_lease(uuid, text, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.acquire_audit_stage_lease(uuid, text, integer) TO service_role;
REVOKE ALL ON FUNCTION public.renew_audit_stage_lease(uuid, text, uuid, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.renew_audit_stage_lease(uuid, text, uuid, integer) TO service_role;
REVOKE ALL ON FUNCTION public.complete_audit_stage(uuid, text, uuid, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.complete_audit_stage(uuid, text, uuid, jsonb) TO service_role;
REVOKE ALL ON FUNCTION public.defer_audit_stage_retry(uuid, text, uuid, timestamptz) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.defer_audit_stage_retry(uuid, text, uuid, timestamptz) TO service_role;
REVOKE ALL ON FUNCTION public.finish_audit_partial(uuid, text, uuid, jsonb, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.finish_audit_partial(uuid, text, uuid, jsonb, text, text) TO service_role;
REVOKE ALL ON FUNCTION public.cancel_audit_run(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cancel_audit_run(uuid) TO service_role;
REVOKE ALL ON FUNCTION public.mark_audit_run_failed(uuid, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.mark_audit_run_failed(uuid, text, text) TO service_role;
REVOKE ALL ON FUNCTION public.finish_audit_model_rate_limited(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.finish_audit_model_rate_limited(uuid) TO service_role;
REVOKE ALL ON FUNCTION public.finalize_audit_verification(uuid, uuid, jsonb, jsonb, boolean, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.finalize_audit_verification(uuid, uuid, jsonb, jsonb, boolean, text, text) TO service_role;
