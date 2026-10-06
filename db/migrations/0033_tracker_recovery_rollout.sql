CREATE OR REPLACE FUNCTION public.claim_comment_github_issue(
	p_comment_id uuid,
	p_project_key text,
	p_lease_token uuid,
	p_lease_seconds integer,
	p_recovery boolean DEFAULT false
)
RETURNS SETOF public.comments
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
	PERFORM pg_advisory_xact_lock(hashtextextended('crrt-github-issue:' || p_project_key, 0));

	RETURN QUERY
	UPDATE public.comments AS comment
	SET
		github_issue_lease_token = p_lease_token,
		github_issue_lease_expires_at = now() + make_interval(
			secs => least(greatest(p_lease_seconds, 30), 900)
		)
	WHERE comment.id = p_comment_id
		AND comment.project_id = p_project_key
		AND comment.status IN ('pending', 'approved')
		AND comment.github_issue_number IS NULL
		AND (
			(p_recovery AND comment.github_issue_uncertain_at IS NOT NULL)
			OR
			(NOT p_recovery AND comment.github_issue_uncertain_at IS NULL)
		)
		AND (
			comment.github_issue_lease_token IS NULL
			OR comment.github_issue_lease_expires_at <= now()
		)
	RETURNING comment.*;
END;
$$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION public.release_comment_github_issue(
	p_comment_id uuid,
	p_project_key text,
	p_lease_token uuid
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
	v_updated integer;
BEGIN
	PERFORM pg_advisory_xact_lock(hashtextextended('crrt-github-issue:' || p_project_key, 0));

	UPDATE public.comments AS comment
	SET
		github_issue_lease_token = NULL,
		github_issue_lease_expires_at = NULL
	WHERE comment.id = p_comment_id
		AND comment.project_id = p_project_key
		AND comment.github_issue_lease_token = p_lease_token
		AND comment.github_issue_number IS NULL;

	GET DIAGNOSTICS v_updated = ROW_COUNT;
	RETURN v_updated = 1;
END;
$$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION public.tracker_dispatch_pending(p_project text)
RETURNS boolean LANGUAGE sql SET search_path = '' AS $$
  SELECT EXISTS(SELECT 1 FROM public.comments c WHERE c.project_id=p_project AND c.github_issue_number IS NULL AND c.github_issue_uncertain_at IS NOT NULL)
    OR EXISTS(SELECT 1 FROM public.comment_external_work w WHERE w.project_id=p_project AND w.state='creating' AND w.uncertain_at IS NOT NULL);
$$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION public.fence_project_privacy_delivery()
RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  IF NEW.widget_private AND (NEW.widget_private IS DISTINCT FROM OLD.widget_private OR NEW.feedback_access IS DISTINCT FROM OLD.feedback_access)
    AND public.tracker_dispatch_pending(NEW.public_key) THEN RAISE EXCEPTION 'tracker_dispatch_in_progress'; END IF;
  IF NEW.widget_private AND NEW.feedback_access='admins' AND EXISTS(
    SELECT 1 FROM public.comment_email_batches b JOIN public.comments c ON c.id=b.delivery_id
    WHERE c.project_id=NEW.public_key AND b.status='pending' AND b.lease_token IS NOT NULL
  ) THEN RAISE EXCEPTION 'feedback_delivery_in_progress'; END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION public.fence_comment_delivery_delete()
RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  IF (OLD.github_issue_number IS NULL AND OLD.github_issue_uncertain_at IS NOT NULL)
    OR EXISTS(SELECT 1 FROM public.comment_external_work w WHERE w.comment_id=OLD.id AND w.state='creating' AND w.uncertain_at IS NOT NULL)
    THEN RAISE EXCEPTION 'tracker_dispatch_in_progress'; END IF;
  IF EXISTS(SELECT 1 FROM public.comment_email_batches b WHERE b.delivery_id=OLD.id AND b.status='pending' AND b.lease_token IS NOT NULL)
    THEN RAISE EXCEPTION 'feedback_delivery_in_progress'; END IF;
  RETURN OLD;
END;
$$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION public.begin_actor_tracker_dispatch(p_project text,p_actor uuid,p_comment uuid,p_lease uuid,p_work uuid DEFAULT NULL)
RETURNS boolean LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  PERFORM public.lock_feedback_actor(p_project,p_actor,'integrations:send');
  PERFORM pg_advisory_xact_lock(hashtextextended('crrt-github-issue:' || p_project,0));
  PERFORM 1 FROM public.comments c WHERE c.id=p_comment AND c.project_id=p_project AND c.status IN ('pending','approved') FOR UPDATE;
  IF NOT FOUND THEN RETURN false; END IF;
  IF p_work IS NULL THEN
    IF NOT public.mark_comment_github_issue_uncertain(p_comment,p_project,p_lease) THEN RETURN false; END IF;
    UPDATE public.comments SET github_issue_lease_expires_at='infinity'::timestamptz
      WHERE id=p_comment AND project_id=p_project AND github_issue_lease_token=p_lease;
    RETURN true;
  END IF;
  UPDATE public.comment_external_work w SET uncertain_at=now(),lease_expires_at='infinity'::timestamptz,updated_at=now()
    WHERE w.id=p_work AND w.comment_id=p_comment AND w.project_id=p_project AND w.state='creating'
      AND w.lease_token=p_lease AND w.uncertain_at IS NULL AND w.lease_expires_at>clock_timestamp();
  RETURN FOUND;
END;
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION public.tracker_dispatch_pending(text),public.begin_actor_tracker_dispatch(text,uuid,uuid,uuid,uuid) FROM PUBLIC,anon,authenticated;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.tracker_dispatch_pending(text),public.begin_actor_tracker_dispatch(text,uuid,uuid,uuid,uuid) TO service_role;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION public.claim_comment_github_issue_v2(
	p_comment_id uuid,
	p_project_key text,
	p_lease_token uuid,
	p_lease_seconds integer,
	p_recovery boolean DEFAULT false
)
RETURNS SETOF public.comments
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
	PERFORM pg_advisory_xact_lock(hashtextextended('crrt-github-issue:' || p_project_key, 0));

	RETURN QUERY
	UPDATE public.comments AS comment
	SET
		github_issue_lease_token = p_lease_token,
		github_issue_lease_expires_at = CASE WHEN p_recovery THEN 'infinity'::timestamptz ELSE now() + make_interval(
			secs => least(greatest(p_lease_seconds, 30), 900)
		) END
	WHERE comment.id = p_comment_id
		AND comment.project_id = p_project_key
		AND comment.status IN ('pending', 'approved')
		AND comment.github_issue_number IS NULL
		AND (
			(p_recovery AND comment.github_issue_uncertain_at IS NOT NULL AND (comment.github_issue_lease_token IS NULL OR comment.github_issue_lease_expires_at = '-infinity'::timestamptz))
			OR
			(NOT p_recovery AND comment.github_issue_uncertain_at IS NULL)
		)
		AND (
			comment.github_issue_lease_token IS NULL
			OR comment.github_issue_lease_expires_at <= now()
		)
	RETURNING comment.*;
END;
$$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION public.release_comment_github_issue_v2(
	p_comment_id uuid,
	p_project_key text,
	p_lease_token uuid
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
	v_updated integer;
BEGIN
	PERFORM pg_advisory_xact_lock(hashtextextended('crrt-github-issue:' || p_project_key, 0));

	UPDATE public.comments AS comment
	SET
		github_issue_lease_token = NULL,
		github_issue_lease_expires_at = NULL
	WHERE comment.id = p_comment_id
		AND comment.project_id = p_project_key
		AND comment.github_issue_lease_token = p_lease_token
		AND comment.github_issue_number IS NULL AND comment.github_issue_uncertain_at IS NULL;

	GET DIAGNOSTICS v_updated = ROW_COUNT;
	RETURN v_updated = 1;
END;
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION public.claim_comment_github_issue_v2(uuid,text,uuid,integer,boolean),public.release_comment_github_issue_v2(uuid,text,uuid) FROM PUBLIC,anon,authenticated;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.claim_comment_github_issue_v2(uuid,text,uuid,integer,boolean),public.release_comment_github_issue_v2(uuid,text,uuid) TO service_role;
--> statement-breakpoint
-- Negative infinity is a durable acknowledgment that this exact sender callback settled.
-- Expired leases and absent coordination sessions are deliberately not acknowledgments.
CREATE OR REPLACE FUNCTION public.acknowledge_tracker_dispatch_stopped(p_project text,p_comment uuid,p_lease uuid,p_work uuid DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  PERFORM 1 FROM public.projects WHERE public_key=p_project FOR SHARE;
  PERFORM pg_advisory_xact_lock(hashtextextended('crrt-github-issue:' || p_project,0));
  PERFORM 1 FROM public.comments WHERE id=p_comment AND project_id=p_project FOR UPDATE;
  IF p_work IS NULL THEN
    UPDATE public.comments SET github_issue_lease_expires_at='-infinity'::timestamptz
      WHERE id=p_comment AND project_id=p_project AND github_issue_lease_token=p_lease
        AND github_issue_number IS NULL AND github_issue_uncertain_at IS NOT NULL;
  ELSE
    UPDATE public.comment_external_work SET lease_expires_at='-infinity'::timestamptz,updated_at=now()
      WHERE id=p_work AND project_id=p_project AND comment_id=p_comment AND lease_token=p_lease
        AND state='creating' AND uncertain_at IS NOT NULL;
  END IF;
END;
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION public.acknowledge_tracker_dispatch_stopped(text,uuid,uuid,uuid) FROM PUBLIC,anon,authenticated;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.acknowledge_tracker_dispatch_stopped(text,uuid,uuid,uuid) TO service_role;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION public.resolve_actor_tracker_dispatch(p_project text,p_actor uuid,p_comment uuid,p_provider text)
RETURNS boolean LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  IF NOT pg_try_advisory_xact_lock(hashtextextended('crrt-tracker-dispatch:' || p_project,0)) THEN RAISE EXCEPTION 'tracker_dispatch_active'; END IF;
  IF public.lock_feedback_actor(p_project,p_actor,'integrations:send') <> 'admin' THEN RAISE EXCEPTION 'forbidden'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('crrt-github-issue:' || p_project,0));
  PERFORM 1 FROM public.comments c WHERE c.id=p_comment AND c.project_id=p_project FOR UPDATE;
  IF NOT FOUND THEN RETURN false; END IF;
  IF p_provider='github' THEN
    IF EXISTS(SELECT 1 FROM public.comments WHERE id=p_comment AND project_id=p_project AND github_issue_uncertain_at IS NOT NULL AND github_issue_lease_token IS NOT NULL AND github_issue_lease_expires_at IS DISTINCT FROM '-infinity'::timestamptz) THEN RAISE EXCEPTION 'tracker_dispatch_unconfirmed'; END IF;
    UPDATE public.comments c SET github_issue_uncertain_at=NULL,github_issue_lease_token=NULL,github_issue_lease_expires_at=NULL
      WHERE c.id=p_comment AND c.project_id=p_project AND c.github_issue_number IS NULL AND c.github_issue_uncertain_at IS NOT NULL;
    RETURN FOUND;
  END IF;
  IF p_provider NOT IN ('linear','jira') THEN RAISE EXCEPTION 'invalid_provider'; END IF;
  IF EXISTS(SELECT 1 FROM public.comment_external_work WHERE project_id=p_project AND comment_id=p_comment AND provider=p_provider AND state='creating' AND uncertain_at IS NOT NULL AND lease_expires_at IS DISTINCT FROM '-infinity'::timestamptz) THEN RAISE EXCEPTION 'tracker_dispatch_unconfirmed'; END IF;
  DELETE FROM public.comment_external_work w WHERE w.project_id=p_project AND w.comment_id=p_comment AND w.provider=p_provider
    AND w.state='creating' AND w.uncertain_at IS NOT NULL;
  RETURN FOUND;
END;
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION public.resolve_actor_tracker_dispatch(text,uuid,uuid,text) FROM PUBLIC,anon,authenticated;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.resolve_actor_tracker_dispatch(text,uuid,uuid,text) TO service_role;
