CREATE TABLE "recording_artifacts" (
	"id" uuid PRIMARY KEY NOT NULL,
	"recording_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"path" text NOT NULL,
	"mime" text NOT NULL,
	"bytes" bigint NOT NULL,
	"sha256" text NOT NULL,
	"offset_ms" integer DEFAULT 0 NOT NULL,
	"verified_at" timestamp with time zone,
	"multipart_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "recording_artifacts_path_unique" UNIQUE("path"),
	CONSTRAINT "recording_artifacts_bytes" CHECK ("recording_artifacts"."bytes">0),
	CONSTRAINT "recording_artifacts_offset" CHECK ("recording_artifacts"."offset_ms">=0),
	CONSTRAINT "recording_artifacts_kind" CHECK ("recording_artifacts"."kind" in ('screen','camera','audio','keyframe','crop','thumbnail'))
);
--> statement-breakpoint
ALTER TABLE "recording_artifacts" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "recording_events" (
	"recording_id" uuid NOT NULL,
	"id" uuid NOT NULL,
	"sequence" integer NOT NULL,
	"kind" text NOT NULL,
	"at_ms" integer NOT NULL,
	"data" jsonb NOT NULL,
	CONSTRAINT "recording_events_recording_id_id_pk" PRIMARY KEY("recording_id","id"),
	CONSTRAINT "recording_events_clock" CHECK ("recording_events"."at_ms">=0 AND "recording_events"."sequence">=0),
	CONSTRAINT "recording_events_kind" CHECK ("recording_events"."kind" in ('mark','click','route'))
);
--> statement-breakpoint
ALTER TABLE "recording_events" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "recording_jobs" (
	"recording_id" uuid NOT NULL,
	"stage" text NOT NULL,
	"state" text DEFAULT 'pending' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"lease_token" uuid,
	"lease_until" timestamp with time zone,
	"available_at" timestamp with time zone DEFAULT now() NOT NULL,
	"failure" jsonb,
	CONSTRAINT "recording_jobs_recording_id_stage_pk" PRIMARY KEY("recording_id","stage"),
	CONSTRAINT "recording_jobs_stage" CHECK ("recording_jobs"."stage" in ('metadata','transcription','alignment','cleanup')),
	CONSTRAINT "recording_jobs_state" CHECK ("recording_jobs"."state" in ('pending','running','done','failed'))
);
--> statement-breakpoint
ALTER TABLE "recording_jobs" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "recording_keyframes" (
	"recording_id" uuid NOT NULL,
	"id" uuid NOT NULL,
	"event_id" uuid,
	"at_ms" integer NOT NULL,
	"artifact_id" uuid NOT NULL,
	"crop_artifact_id" uuid,
	"segment_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	CONSTRAINT "recording_keyframes_recording_id_id_pk" PRIMARY KEY("recording_id","id"),
	CONSTRAINT "recording_keyframes_clock" CHECK ("recording_keyframes"."at_ms">=0)
);
--> statement-breakpoint
ALTER TABLE "recording_keyframes" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "recording_transcript_segments" (
	"recording_id" uuid NOT NULL,
	"id" text NOT NULL,
	"start_ms" integer NOT NULL,
	"end_ms" integer NOT NULL,
	"text" text NOT NULL,
	"provider" text NOT NULL,
	"language" text NOT NULL,
	CONSTRAINT "recording_transcript_segments_recording_id_id_pk" PRIMARY KEY("recording_id","id"),
	CONSTRAINT "recording_transcript_clock" CHECK ("recording_transcript_segments"."start_ms">=0 AND "recording_transcript_segments"."end_ms">="recording_transcript_segments"."start_ms")
);
--> statement-breakpoint
ALTER TABLE "recording_transcript_segments" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "recording_transcription_limits" (
	"identity" text PRIMARY KEY NOT NULL,
	"window_start" timestamp with time zone NOT NULL,
	"requests" integer DEFAULT 0 NOT NULL,
	"bytes" bigint DEFAULT 0 NOT NULL,
	CONSTRAINT "recording_transcription_identity" CHECK ("recording_transcription_limits"."identity" = 'global' or "recording_transcription_limits"."identity" ~ '^[a-f0-9]{64}$'),
	CONSTRAINT "recording_transcription_usage" CHECK ("recording_transcription_limits"."requests" >= 0 and "recording_transcription_limits"."bytes" >= 0)
);
--> statement-breakpoint
ALTER TABLE "recording_transcription_limits" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "recording_usage" (
	"recording_id" uuid NOT NULL,
	"actor_id" uuid NOT NULL,
	"request_key" uuid NOT NULL,
	"resource" text NOT NULL,
	"amount" bigint NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "recording_usage_recording_id_actor_id_request_key_resource_pk" PRIMARY KEY("recording_id","actor_id","request_key","resource"),
	CONSTRAINT "recording_usage_resource" CHECK ("recording_usage"."resource" in ('recording','storage_bytes','agent_payload')),
	CONSTRAINT "recording_usage_amount" CHECK ("recording_usage"."amount">=0)
);
--> statement-breakpoint
ALTER TABLE "recording_usage" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "recordings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" uuid,
	"storage_prefix" text NOT NULL,
	"storage_provider" text DEFAULT 'supabase' NOT NULL,
	"storage_bucket" text DEFAULT 'record-media' NOT NULL,
	"project_key" text,
	"client_key" uuid NOT NULL,
	"request_hash" text NOT NULL,
	"share_hash" text NOT NULL,
	"title" text NOT NULL,
	"source" text NOT NULL,
	"state" text DEFAULT 'recording' NOT NULL,
	"duration_ms" integer,
	"manifest_hash" text,
	"manifest" jsonb,
	"media_metadata" jsonb,
	"consent" jsonb,
	"failure" jsonb,
	"brain_references" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"revision" integer DEFAULT 0 NOT NULL,
	"reserved_bytes" bigint DEFAULT 0 NOT NULL,
	"derivation_reserved_bytes" bigint DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"abandoned_at" timestamp with time zone DEFAULT now()+interval '24 hours' NOT NULL,
	"deleted_at" timestamp with time zone,
	"cleaned_at" timestamp with time zone,
	CONSTRAINT "recordings_share_hash_unique" UNIQUE("share_hash"),
	CONSTRAINT "recordings_source" CHECK ("recordings"."source" in ('tab','window','screen')),
	CONSTRAINT "recordings_state" CHECK ("recordings"."state" in ('recording','uploading','processing','ready','failed')),
	CONSTRAINT "recordings_duration" CHECK ("recordings"."duration_ms" >= 0),
	CONSTRAINT "recordings_bytes" CHECK ("recordings"."reserved_bytes" >= 0),
	CONSTRAINT "recordings_storage_provider" CHECK ("recordings"."storage_provider" in ('supabase','r2'))
);
--> statement-breakpoint
ALTER TABLE "recordings" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "recording_artifacts" ADD CONSTRAINT "recording_artifacts_recording_id_recordings_id_fk" FOREIGN KEY ("recording_id") REFERENCES "public"."recordings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recording_events" ADD CONSTRAINT "recording_events_recording_id_recordings_id_fk" FOREIGN KEY ("recording_id") REFERENCES "public"."recordings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recording_jobs" ADD CONSTRAINT "recording_jobs_recording_id_recordings_id_fk" FOREIGN KEY ("recording_id") REFERENCES "public"."recordings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recording_keyframes" ADD CONSTRAINT "recording_keyframes_recording_id_recordings_id_fk" FOREIGN KEY ("recording_id") REFERENCES "public"."recordings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recording_keyframes" ADD CONSTRAINT "recording_keyframes_artifact_id_recording_artifacts_id_fk" FOREIGN KEY ("artifact_id") REFERENCES "public"."recording_artifacts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recording_keyframes" ADD CONSTRAINT "recording_keyframes_crop_artifact_id_recording_artifacts_id_fk" FOREIGN KEY ("crop_artifact_id") REFERENCES "public"."recording_artifacts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recording_transcript_segments" ADD CONSTRAINT "recording_transcript_segments_recording_id_recordings_id_fk" FOREIGN KEY ("recording_id") REFERENCES "public"."recordings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recording_usage" ADD CONSTRAINT "recording_usage_recording_id_recordings_id_fk" FOREIGN KEY ("recording_id") REFERENCES "public"."recordings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recording_usage" ADD CONSTRAINT "recording_usage_actor_id_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "auth"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recordings" ADD CONSTRAINT "recordings_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "auth"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recordings" ADD CONSTRAINT "recordings_project_key_projects_public_key_fk" FOREIGN KEY ("project_key") REFERENCES "public"."projects"("public_key") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "recording_artifacts_recording" ON "recording_artifacts" USING btree ("recording_id");--> statement-breakpoint
CREATE UNIQUE INDEX "recording_events_sequence" ON "recording_events" USING btree ("recording_id","sequence");--> statement-breakpoint
CREATE INDEX "recording_jobs_queue" ON "recording_jobs" USING btree ("state","available_at");--> statement-breakpoint
CREATE UNIQUE INDEX "recordings_owner_client" ON "recordings" USING btree ("owner_id","client_key");--> statement-breakpoint
CREATE INDEX "recordings_library" ON "recordings" USING btree ("owner_id","created_at");--> statement-breakpoint
CREATE INDEX "recordings_cleanup" ON "recordings" USING btree ("deleted_at","abandoned_at");

CREATE FUNCTION public.record_refresh_state(p_id uuid) RETURNS void LANGUAGE plpgsql SET search_path='' AS $$
DECLARE failed jsonb;
BEGIN
  SELECT failure INTO failed FROM public.recording_jobs WHERE recording_id=p_id AND stage<>'cleanup' AND state='failed' ORDER BY stage LIMIT 1;
  IF FOUND THEN UPDATE public.recordings SET state='failed',failure=failed WHERE id=p_id;
  ELSIF EXISTS(SELECT 1 FROM public.recording_jobs WHERE recording_id=p_id AND stage='alignment' AND state='done') THEN
    UPDATE public.recordings SET state='ready',failure=NULL WHERE id=p_id;
  ELSE UPDATE public.recordings SET state='processing',failure=NULL WHERE id=p_id; END IF;
END $$;
--> statement-breakpoint
CREATE FUNCTION public.record_owner_deleted() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
  NEW.deleted_at:=coalesce(NEW.deleted_at,now()); NEW.updated_at:=now(); NEW.revision:=OLD.revision+1;
  INSERT INTO public.recording_jobs(recording_id,stage,available_at) VALUES(NEW.id,'cleanup',now()+interval '2 hours')
    ON CONFLICT(recording_id,stage) DO NOTHING;
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER record_owner_deleted BEFORE UPDATE OF owner_id ON public.recordings
  FOR EACH ROW WHEN (OLD.owner_id IS NOT NULL AND NEW.owner_id IS NULL) EXECUTE FUNCTION public.record_owner_deleted();
--> statement-breakpoint
CREATE FUNCTION public.record_create(p_actor uuid,p_id uuid,p_input jsonb,p_limit integer) RETURNS jsonb
LANGUAGE plpgsql SET search_path='' AS $$
DECLARE r public.recordings;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended(p_actor::text,5959));
  SELECT * INTO r FROM public.recordings WHERE owner_id=p_actor AND client_key=(p_input->>'clientKey')::uuid;
  IF FOUND THEN
    IF r.request_hash<>p_input->>'requestHash' OR r.deleted_at IS NOT NULL THEN RAISE EXCEPTION 'record_conflict'; END IF;
    RETURN to_jsonb(r);
  END IF;
  IF (SELECT count(*) FROM public.recordings WHERE owner_id=p_actor AND cleaned_at IS NULL)>=p_limit THEN
    RAISE EXCEPTION 'record_quota';
  END IF;
  INSERT INTO public.recordings(id,owner_id,storage_prefix,client_key,request_hash,share_hash,title,source,consent,storage_provider,storage_bucket)
    VALUES(p_id,p_actor,p_actor::text||'/'||p_id::text,(p_input->>'clientKey')::uuid,p_input->>'requestHash',p_input->>'shareHash',
      p_input->>'title',p_input->>'source',p_input->'consent',coalesce(p_input->>'storageProvider','supabase'),coalesce(p_input->>'storageBucket','record-media')) RETURNING * INTO r;
  INSERT INTO public.recording_usage(recording_id,actor_id,request_key,resource,amount)
    VALUES(r.id,p_actor,r.client_key,'recording',1);
  RETURN to_jsonb(r);
END $$;
--> statement-breakpoint
CREATE FUNCTION public.record_command(p_actor uuid,p_id uuid,p_action text,p_input jsonb DEFAULT '{}') RETURNS jsonb
LANGUAGE plpgsql SET search_path='' AS $$
DECLARE r public.recordings; a jsonb; total bigint; project text; artifact public.recording_artifacts; derived bigint;
BEGIN
  -- The same owner lock serializes quota reservations across their recordings.
  PERFORM pg_advisory_xact_lock(hashtextextended(p_actor::text,5959));
  SELECT * INTO r FROM public.recordings WHERE id=p_id AND owner_id=p_actor AND deleted_at IS NULL FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'record_not_found'; END IF;
  IF p_action='title' THEN
    UPDATE public.recordings SET title=p_input->>'title' WHERE id=p_id;
  ELSIF p_action='project' THEN
    project:=p_input->>'projectKey';
    IF project IS NOT NULL THEN
      PERFORM 1 FROM public.project_members m JOIN public.projects p ON p.public_key=m.project_key
        WHERE m.project_key=project AND m.user_id=p_actor AND m.role IN ('admin','member')
        AND (NOT p.widget_private OR p.feedback_access='team' OR m.role='admin') FOR SHARE OF m,p;
      IF NOT FOUND THEN RAISE EXCEPTION 'record_forbidden'; END IF;
    END IF;
    UPDATE public.recordings SET project_key=project WHERE id=p_id;
  ELSIF p_action='share' THEN
    UPDATE public.recordings SET share_hash=p_input->>'shareHash' WHERE id=p_id;
  ELSIF p_action='upload' THEN
    IF r.manifest_hash IS NOT NULL THEN RAISE EXCEPTION 'record_conflict'; END IF;
    a:=p_input->'artifact';
    IF EXISTS(SELECT 1 FROM public.recording_artifacts WHERE id=(a->>'id')::uuid) THEN
      IF NOT EXISTS(SELECT 1 FROM public.recording_artifacts WHERE id=(a->>'id')::uuid AND recording_id=p_id
        AND path=a->>'path' AND bytes=(a->>'bytes')::bigint AND sha256=a->>'sha256' AND mime=a->>'mime'
        AND kind=a->>'kind' AND offset_ms=(a->>'offsetMs')::integer) THEN RAISE EXCEPTION 'record_conflict'; END IF;
    ELSE
      SELECT coalesce(sum(reserved_bytes),0) INTO total FROM public.recordings WHERE owner_id=p_actor AND cleaned_at IS NULL;
      -- Storage signatures bind the object path, not its declared byte length.
      -- Reserve the bucket's full 1 GiB object limit until HEAD verifies the
      -- immutable object, so lying about size cannot bypass account quotas.
      IF total+1073741824>(p_input->>'byteLimit')::bigint THEN RAISE EXCEPTION 'record_quota'; END IF;
      IF (SELECT count(*) FROM public.recording_artifacts WHERE recording_id=p_id)>=32 THEN RAISE EXCEPTION 'record_quota'; END IF;
      INSERT INTO public.recording_artifacts(id,recording_id,kind,path,mime,bytes,sha256,offset_ms)
        VALUES((a->>'id')::uuid,p_id,a->>'kind',a->>'path',a->>'mime',(a->>'bytes')::bigint,a->>'sha256',(a->>'offsetMs')::integer);
      UPDATE public.recordings SET reserved_bytes=reserved_bytes+1073741824 WHERE id=p_id;
      INSERT INTO public.recording_usage(recording_id,actor_id,request_key,resource,amount)
        VALUES(p_id,p_actor,(a->>'id')::uuid,'storage_bytes',(a->>'bytes')::bigint);
    END IF;
    UPDATE public.recordings SET state='uploading' WHERE id=p_id;
  ELSIF p_action='complete' THEN
    SELECT * INTO artifact FROM public.recording_artifacts WHERE recording_id=p_id AND id=(p_input->>'artifactId')::uuid FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'record_not_found'; END IF;
    IF artifact.verified_at IS NOT NULL THEN RETURN to_jsonb(r); END IF;
    UPDATE public.recording_artifacts SET verified_at=now() WHERE id=artifact.id;
    UPDATE public.recordings SET reserved_bytes=reserved_bytes-1073741824+artifact.bytes WHERE id=p_id;
  ELSIF p_action='finalize' THEN
    IF r.manifest_hash IS NOT NULL THEN
      IF r.manifest_hash<>p_input->>'manifestHash' THEN RAISE EXCEPTION 'record_conflict'; END IF;
      RETURN to_jsonb(r);
    END IF;
    derived:=2097152*(1+jsonb_array_length(p_input->'manifest'->'events')+
      (SELECT count(*) FROM jsonb_array_elements(p_input->'manifest'->'events') e WHERE e ? 'crop'));
    SELECT coalesce(sum(reserved_bytes),0) INTO total FROM public.recordings WHERE owner_id=p_actor AND cleaned_at IS NULL;
    IF total+derived>coalesce((p_input->>'byteLimit')::bigint,5368709120) THEN RAISE EXCEPTION 'record_quota'; END IF;
    IF NOT EXISTS(SELECT 1 FROM public.recording_artifacts WHERE recording_id=p_id AND kind='screen')
      OR EXISTS(SELECT 1 FROM public.recording_artifacts WHERE recording_id=p_id AND verified_at IS NULL) THEN
      RAISE EXCEPTION 'record_upload_incomplete';
    END IF;
    IF (SELECT jsonb_agg(jsonb_build_object('id',id,'kind',kind,'mime',mime,'bytes',bytes,'sha256',sha256,'offsetMs',offset_ms) ORDER BY id)
          FROM public.recording_artifacts WHERE recording_id=p_id AND kind IN ('screen','camera','audio'))
      IS DISTINCT FROM (SELECT jsonb_agg(entry ORDER BY (entry->>'id')::uuid) FROM jsonb_array_elements(p_input->'manifest'->'artifacts') entry) THEN
      RAISE EXCEPTION 'record_artifact_mismatch';
    END IF;
    INSERT INTO public.recording_events(recording_id,id,sequence,kind,at_ms,data)
      SELECT p_id,(e->>'id')::uuid,(e->>'sequence')::integer,e->>'kind',(e->>'atMs')::integer,e
      FROM jsonb_array_elements(p_input->'manifest'->'events') e;
    UPDATE public.recordings SET state='processing',manifest_hash=p_input->>'manifestHash',
      manifest=p_input->'manifest',duration_ms=(p_input->'manifest'->>'durationMs')::integer,
      derivation_reserved_bytes=derived,reserved_bytes=reserved_bytes+derived WHERE id=p_id;
    INSERT INTO public.recording_jobs(recording_id,stage) VALUES(p_id,'metadata'),(p_id,'transcription'),(p_id,'alignment');
  ELSIF p_action='retry' THEN
    IF NOT EXISTS(SELECT 1 FROM public.recording_jobs WHERE recording_id=p_id AND stage=p_input->>'stage'
      AND state='failed' AND (failure->>'retryable')::boolean) THEN RAISE EXCEPTION 'record_conflict'; END IF;
    UPDATE public.recording_jobs SET state='pending',attempts=0,failure=NULL,available_at=now()
      WHERE recording_id=p_id AND stage=p_input->>'stage';
    PERFORM public.record_refresh_state(p_id);
  ELSIF p_action='delete' THEN
    UPDATE public.recordings SET deleted_at=now() WHERE id=p_id;
    INSERT INTO public.recording_jobs(recording_id,stage,available_at) VALUES(p_id,'cleanup',now()+interval '2 hours')
      ON CONFLICT(recording_id,stage) DO NOTHING;
  ELSE RAISE EXCEPTION 'record_invalid'; END IF;
  UPDATE public.recordings SET revision=revision+1,updated_at=now() WHERE id=p_id RETURNING * INTO r;
  RETURN to_jsonb(r);
END $$;
--> statement-breakpoint
CREATE FUNCTION public.record_claim(p_stage text,p_lease uuid) RETURNS jsonb LANGUAGE plpgsql SET search_path='' AS $$
DECLARE j public.recording_jobs;
BEGIN
  SELECT q.* INTO j FROM public.recording_jobs q JOIN public.recordings r ON r.id=q.recording_id
    WHERE q.stage=p_stage AND (q.state='pending' OR (q.state='running' AND q.lease_until<now()))
      AND q.available_at<=now() AND (p_stage='cleanup' OR (r.deleted_at IS NULL AND r.owner_id IS NOT NULL))
      AND (p_stage<>'alignment' OR NOT EXISTS(SELECT 1 FROM public.recording_jobs deps
        WHERE deps.recording_id=q.recording_id AND deps.stage IN ('metadata','transcription') AND deps.state<>'done'))
    ORDER BY q.available_at,q.recording_id LIMIT 1 FOR UPDATE OF q SKIP LOCKED;
  IF NOT FOUND THEN RETURN NULL; END IF;
  UPDATE public.recording_jobs SET state='running',attempts=attempts+1,lease_token=p_lease,lease_until=now()+interval '5 minutes'
    WHERE recording_id=j.recording_id AND stage=j.stage RETURNING * INTO j;
  RETURN to_jsonb(j);
END $$;
--> statement-breakpoint
CREATE FUNCTION public.record_finish(p_id uuid,p_stage text,p_lease uuid,p_output jsonb,p_failure jsonb DEFAULT NULL)
RETURNS boolean LANGUAGE plpgsql SET search_path='' AS $$
DECLARE r public.recordings; j public.recording_jobs; a jsonb; owner uuid; added bigint;
BEGIN
  SELECT owner_id INTO owner FROM public.recordings WHERE id=p_id;
  IF owner IS NOT NULL THEN PERFORM pg_advisory_xact_lock(hashtextextended(owner::text,5959)); END IF;
  SELECT * INTO r FROM public.recordings WHERE id=p_id FOR UPDATE;
  SELECT * INTO j FROM public.recording_jobs WHERE recording_id=p_id AND stage=p_stage AND state='running'
    AND lease_token=p_lease AND lease_until>now() FOR UPDATE;
  IF NOT FOUND OR (r.deleted_at IS NOT NULL AND p_stage<>'cleanup') THEN RETURN false; END IF;
  IF p_failure IS NOT NULL THEN
    UPDATE public.recording_jobs SET state=CASE WHEN p_stage='cleanup' OR ((p_failure->>'retryable')::boolean AND attempts<3) THEN 'pending' ELSE 'failed' END,
      failure=p_failure,available_at=now()+make_interval(secs=>least(3600,30*power(2,least(attempts,7))::integer)),lease_token=NULL,lease_until=NULL
      WHERE recording_id=p_id AND stage=p_stage RETURNING * INTO j;
    IF p_stage<>'cleanup' THEN PERFORM public.record_refresh_state(p_id); END IF;
    RETURN true;
  END IF;
  IF p_stage='metadata' THEN
    SELECT coalesce(sum((entry->>'bytes')::bigint),0) INTO added FROM jsonb_array_elements(p_output->'artifacts') entry;
    IF added>r.derivation_reserved_bytes OR (SELECT coalesce(sum(reserved_bytes),0) FROM public.recordings WHERE owner_id=owner AND cleaned_at IS NULL)-r.derivation_reserved_bytes+added>(p_output->>'byteLimit')::bigint THEN
      RAISE EXCEPTION 'record_quota';
    END IF;
    FOR a IN SELECT * FROM jsonb_array_elements(p_output->'artifacts') LOOP
      INSERT INTO public.recording_artifacts(id,recording_id,kind,path,mime,bytes,sha256,verified_at)
        VALUES((a->>'id')::uuid,p_id,a->>'kind',a->>'path',a->>'mime',(a->>'bytes')::bigint,a->>'sha256',now());
      INSERT INTO public.recording_usage(recording_id,actor_id,request_key,resource,amount)
        VALUES(p_id,owner,(a->>'id')::uuid,'storage_bytes',(a->>'bytes')::bigint);
    END LOOP;
    INSERT INTO public.recording_keyframes(recording_id,id,event_id,at_ms,artifact_id,crop_artifact_id)
      SELECT p_id,(f->>'id')::uuid,(f->>'eventId')::uuid,(f->>'atMs')::integer,(f->>'artifactId')::uuid,(f->>'cropArtifactId')::uuid
      FROM jsonb_array_elements(p_output->'keyframes') f;
    UPDATE public.recordings SET media_metadata=p_output->'metadata',reserved_bytes=reserved_bytes-r.derivation_reserved_bytes+added,derivation_reserved_bytes=0 WHERE id=p_id;
  ELSIF p_stage='transcription' THEN
    INSERT INTO public.recording_transcript_segments(recording_id,id,start_ms,end_ms,text,provider,language)
      SELECT p_id,s->>'id',(s->>'startMs')::integer,(s->>'endMs')::integer,s->>'text',p_output->>'source',p_output->>'language'
      FROM jsonb_array_elements(p_output->'segments') s;
  ELSIF p_stage='alignment' THEN
    UPDATE public.recording_keyframes k SET segment_ids=coalesce((SELECT jsonb_agg(s.id ORDER BY s.start_ms,s.id)
      FROM public.recording_transcript_segments s WHERE s.recording_id=p_id AND k.at_ms BETWEEN greatest(0,s.start_ms-3000) AND s.end_ms+3000),'[]'::jsonb)
      WHERE k.recording_id=p_id;
  ELSIF p_stage='cleanup' THEN
    IF r.deleted_at IS NULL THEN RETURN false; END IF;
    DELETE FROM public.recording_events WHERE recording_id=p_id;
    DELETE FROM public.recording_keyframes WHERE recording_id=p_id;
    DELETE FROM public.recording_transcript_segments WHERE recording_id=p_id;
    DELETE FROM public.recording_artifacts WHERE recording_id=p_id;
    UPDATE public.recordings SET cleaned_at=coalesce(cleaned_at,now()),manifest=NULL,consent=NULL,media_metadata=NULL,project_key=NULL,brain_references='[]',reserved_bytes=0,derivation_reserved_bytes=0,title='Deleted recording' WHERE id=p_id;
  END IF;
  UPDATE public.recording_jobs SET state='done',failure=NULL,lease_token=NULL,lease_until=NULL,
    available_at=CASE WHEN p_stage='cleanup' THEN now()+interval '1 hour' ELSE available_at END WHERE recording_id=p_id AND stage=p_stage;
  IF p_stage<>'cleanup' THEN PERFORM public.record_refresh_state(p_id); END IF;
  RETURN true;
END $$;
--> statement-breakpoint
CREATE FUNCTION public.record_sweep() RETURNS integer LANGUAGE plpgsql SET search_path='' AS $$
DECLARE affected integer;
BEGIN
  UPDATE public.recordings SET deleted_at=now() WHERE deleted_at IS NULL AND
    (owner_id IS NULL OR (manifest_hash IS NULL AND abandoned_at<now()))
    AND id IN (SELECT id FROM public.recordings WHERE deleted_at IS NULL AND (owner_id IS NULL OR (manifest_hash IS NULL AND abandoned_at<now())) LIMIT 1000);
  INSERT INTO public.recording_jobs(recording_id,stage,available_at)
    SELECT id,'cleanup',greatest(deleted_at+interval '2 hours',updated_at+interval '2 hours') FROM public.recordings
    WHERE deleted_at IS NOT NULL AND cleaned_at IS NULL ON CONFLICT(recording_id,stage) DO NOTHING;
  GET DIAGNOSTICS affected=ROW_COUNT;
  -- Keep the immutable prefix after clearing artifact metadata. Reconcile
  -- tombstones too, so an externally delayed storage write cannot be orphaned.
  UPDATE public.recording_jobs SET state='pending',available_at=now() WHERE stage='cleanup' AND state='done' AND available_at<=now()
    AND recording_id IN (SELECT q.recording_id FROM public.recording_jobs q JOIN public.recordings r ON r.id=q.recording_id
      WHERE q.stage='cleanup' AND q.state='done' AND q.available_at<=now() AND r.deleted_at IS NOT NULL AND r.cleaned_at IS NOT NULL
      ORDER BY q.available_at,q.recording_id LIMIT 1000);
  RETURN affected;
END $$;
--> statement-breakpoint
CREATE FUNCTION public.record_charge_payload(p_actor uuid,p_id uuid,p_key uuid,p_limit integer,p_revision integer,p_project text,p_prices text[] DEFAULT NULL) RETURNS void
LANGUAGE plpgsql SET search_path='' AS $$
DECLARE r public.recordings; sponsor uuid; billing public.billing_accounts;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended(p_actor::text,5959));
  SELECT * INTO r FROM public.recordings WHERE id=p_id AND owner_id=p_actor AND deleted_at IS NULL FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'record_not_found'; END IF;
  IF r.revision IS DISTINCT FROM p_revision OR r.project_key IS DISTINCT FROM p_project THEN RAISE EXCEPTION 'record_conflict'; END IF;
  sponsor:=p_actor;
  IF r.project_key IS NOT NULL THEN
    PERFORM public.lock_feedback_actor(r.project_key,p_actor,'agent:operate');
    SELECT user_id INTO sponsor FROM public.project_members WHERE project_key=r.project_key AND is_owner FOR SHARE;
    IF sponsor IS NULL THEN RAISE EXCEPTION 'record_forbidden'; END IF;
  END IF;
  IF p_prices IS NOT NULL THEN
    SELECT * INTO billing FROM public.billing_accounts WHERE user_id=sponsor FOR SHARE;
    IF NOT FOUND OR NOT (coalesce(billing.is_legacy,false) OR coalesce((billing.plan IN ('pro','studio') AND billing.price_id=ANY(p_prices)
      AND billing.period_start<=now() AND billing.period_end>now()
      AND (billing.subscription_status IN ('active','trialing') OR (billing.subscription_status='past_due' AND billing.grace_until>now()))),false)) THEN
      RAISE EXCEPTION 'record_upgrade_required';
    END IF;
  END IF;
  IF EXISTS(SELECT 1 FROM public.recording_usage WHERE recording_id=p_id AND actor_id=p_actor AND request_key=p_key AND resource='agent_payload') THEN RETURN; END IF;
  IF (SELECT count(*) FROM public.recording_usage WHERE actor_id=p_actor AND resource='agent_payload' AND created_at>=date_trunc('day',now()))>=p_limit THEN RAISE EXCEPTION 'record_quota'; END IF;
  INSERT INTO public.recording_usage(recording_id,actor_id,request_key,resource,amount) VALUES(p_id,p_actor,p_key,'agent_payload',1);
END $$;
--> statement-breakpoint
CREATE FUNCTION public.record_usage_summary(p_actor uuid) RETURNS jsonb LANGUAGE sql STABLE SET search_path='' AS $$
  SELECT jsonb_build_object('recordings',(SELECT count(*) FROM public.recordings WHERE owner_id=p_actor AND cleaned_at IS NULL),
    'storageBytes',(SELECT coalesce(sum(reserved_bytes),0) FROM public.recordings WHERE owner_id=p_actor AND cleaned_at IS NULL),
    'agentPayloadsToday',(SELECT count(*) FROM public.recording_usage WHERE actor_id=p_actor AND resource='agent_payload' AND created_at>=date_trunc('day',now())));
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION public.record_create(uuid,uuid,jsonb,integer),public.record_command(uuid,uuid,text,jsonb),
  public.record_claim(text,uuid),public.record_finish(uuid,text,uuid,jsonb,jsonb),public.record_sweep(),public.record_charge_payload(uuid,uuid,uuid,integer,integer,text,text[]),public.record_usage_summary(uuid),public.record_refresh_state(uuid),public.record_owner_deleted()
  FROM PUBLIC,anon,authenticated;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.record_create(uuid,uuid,jsonb,integer),public.record_command(uuid,uuid,text,jsonb),
  public.record_claim(text,uuid),public.record_finish(uuid,text,uuid,jsonb,jsonb),public.record_sweep(),public.record_charge_payload(uuid,uuid,uuid,integer,integer,text,text[]),public.record_usage_summary(uuid),public.record_refresh_state(uuid)
  TO service_role;
--> statement-breakpoint
GRANT ALL ON public.recordings,public.recording_artifacts,public.recording_events,public.recording_keyframes,
  public.recording_transcript_segments,public.recording_jobs,public.recording_usage TO service_role;
--> statement-breakpoint
NOTIFY pgrst,'reload schema';

--> statement-breakpoint

CREATE FUNCTION public.reserve_record_transcription(p_client text,p_bytes bigint,p_client_requests integer,p_client_bytes bigint,p_global_requests integer,p_global_bytes bigint) RETURNS boolean
LANGUAGE plpgsql SET search_path='' AS $$
DECLARE g public.recording_transcription_limits; c public.recording_transcription_limits;
  hour_start timestamptz:=date_trunc('hour',now(),'UTC'); day_start timestamptz:=date_trunc('day',now(),'UTC');
BEGIN
  IF p_client IS NULL OR p_client !~ '^[a-f0-9]{64}$' OR p_bytes IS NULL OR p_bytes<1 OR p_bytes>33554432
    OR p_client_requests IS NULL OR p_client_requests<1 OR p_client_bytes IS NULL OR p_client_bytes<1
    OR p_global_requests IS NULL OR p_global_requests<1 OR p_global_bytes IS NULL OR p_global_bytes<1 THEN
    RAISE EXCEPTION 'record_transcription_invalid';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('record-transcription-budget',5959));
  INSERT INTO public.recording_transcription_limits(identity,window_start) VALUES('global',day_start) ON CONFLICT DO NOTHING;
  SELECT * INTO g FROM public.recording_transcription_limits WHERE identity='global' FOR UPDATE;
  IF g.window_start<>day_start THEN g.requests:=0; g.bytes:=0; END IF;
  IF g.requests>=p_global_requests OR p_bytes>p_global_bytes-g.bytes THEN RETURN false; END IF;
  INSERT INTO public.recording_transcription_limits(identity,window_start) VALUES(p_client,hour_start) ON CONFLICT DO NOTHING;
  SELECT * INTO c FROM public.recording_transcription_limits WHERE identity=p_client FOR UPDATE;
  IF c.window_start<>hour_start THEN c.requests:=0; c.bytes:=0; END IF;
  IF c.requests>=p_client_requests OR p_bytes>p_client_bytes-c.bytes THEN RETURN false; END IF;
  UPDATE public.recording_transcription_limits SET window_start=day_start,requests=g.requests+1,bytes=g.bytes+p_bytes WHERE identity='global';
  UPDATE public.recording_transcription_limits SET window_start=hour_start,requests=c.requests+1,bytes=c.bytes+p_bytes WHERE identity=p_client;
  DELETE FROM public.recording_transcription_limits WHERE identity<>'global' AND window_start<hour_start-interval '1 day';
  RETURN true;
END $$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION public.reserve_record_transcription(text,bigint,integer,bigint,integer,bigint) FROM PUBLIC,anon,authenticated;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.reserve_record_transcription(text,bigint,integer,bigint,integer,bigint) TO service_role;
--> statement-breakpoint
GRANT ALL ON public.recording_transcription_limits TO service_role;
--> statement-breakpoint
NOTIFY pgrst,'reload schema';
