ALTER TABLE "projects" ADD COLUMN "widget_private" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "feedback_access" text DEFAULT 'team' NOT NULL;
--> statement-breakpoint

CREATE FUNCTION public.project_feedback_allowed(p_project text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.projects p JOIN public.project_members m ON m.project_key = p.public_key
    WHERE p.public_key = p_project AND m.user_id = auth.uid()
      AND (NOT p.widget_private OR p.feedback_access <> 'admins' OR m.role = 'admin' OR m.is_owner)
  );
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION public.project_feedback_allowed(text) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.project_feedback_allowed(text) TO authenticated, service_role;
--> statement-breakpoint
ALTER POLICY notifications_select_own ON public.notifications
USING (auth.uid() = user_id AND (kind <> 'comment.activity' OR public.project_feedback_allowed(payload->>'projectKey')));
--> statement-breakpoint
CREATE FUNCTION public.guard_private_widget_comment()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
DECLARE v_private boolean;
BEGIN
  IF NEW.source = 'widget' AND NEW.created_by = 'public' AND NEW.created_by_user_id IS NULL THEN
    SELECT p.widget_private INTO v_private FROM public.projects p WHERE p.public_key = NEW.project_id FOR SHARE;
    IF v_private THEN RAISE EXCEPTION 'private_feedback_login_required'; END IF;
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER guard_private_widget_comment BEFORE INSERT ON public.comments
FOR EACH ROW EXECUTE FUNCTION public.guard_private_widget_comment();
--> statement-breakpoint
CREATE FUNCTION public.guard_private_feedback_notification()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
DECLARE v_private boolean; v_access text;
BEGIN
  IF NEW.kind = 'comment.activity' THEN
    SELECT p.widget_private, p.feedback_access INTO v_private, v_access
      FROM public.projects p WHERE p.public_key = NEW.payload->>'projectKey' FOR SHARE;
    IF v_private AND v_access = 'admins' AND NOT EXISTS (
      SELECT 1 FROM public.project_members m WHERE m.project_key = NEW.payload->>'projectKey'
        AND m.user_id = NEW.user_id AND (m.role = 'admin' OR m.is_owner)
    ) THEN RETURN NULL; END IF;
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER guard_private_feedback_notification BEFORE INSERT OR UPDATE OF payload ON public.notifications
FOR EACH ROW EXECUTE FUNCTION public.guard_private_feedback_notification();
--> statement-breakpoint
-- Acquire the project lock before the existing RPC takes notification-row
-- locks, matching the settings cleanup order and avoiding deadlocks.
--> statement-breakpoint
ALTER FUNCTION public.create_or_increment_comment_activity_notification(uuid, text, text, uuid, text, text)
RENAME TO create_or_increment_comment_activity_notification_unchecked;
--> statement-breakpoint
REVOKE ALL ON FUNCTION public.create_or_increment_comment_activity_notification_unchecked(uuid, text, text, uuid, text, text) FROM PUBLIC, anon, authenticated;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.create_or_increment_comment_activity_notification_unchecked(uuid, text, text, uuid, text, text) TO service_role;
--> statement-breakpoint
CREATE FUNCTION public.create_or_increment_comment_activity_notification(
  p_user_id uuid, p_project_key text, p_project_name text, p_comment_id uuid, p_author_name text, p_page_url text
) RETURNS TABLE(id uuid, user_id uuid, kind text, payload jsonb, read_at timestamptz, created_at timestamptz)
LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  PERFORM 1 FROM public.projects p WHERE p.public_key = p_project_key FOR SHARE;
  RETURN QUERY SELECT * FROM public.create_or_increment_comment_activity_notification_unchecked(
    p_user_id, p_project_key, p_project_name, p_comment_id, p_author_name, p_page_url
  );
END;
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION public.create_or_increment_comment_activity_notification(uuid, text, text, uuid, text, text) FROM PUBLIC, anon, authenticated;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.create_or_increment_comment_activity_notification(uuid, text, text, uuid, text, text) TO service_role;
--> statement-breakpoint
CREATE FUNCTION public.cleanup_restricted_project_feedback()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.widget_private AND NEW.feedback_access = 'admins' THEN
    DELETE FROM public.notifications n WHERE n.kind = 'comment.activity' AND n.payload->>'projectKey' = NEW.public_key
      AND NOT EXISTS (SELECT 1 FROM public.project_members m WHERE m.project_key = NEW.public_key
        AND m.user_id = n.user_id AND (m.role = 'admin' OR m.is_owner));
    UPDATE public.comment_email_batches b SET status = 'failed', last_error = 'project_privacy_changed'
      WHERE b.status = 'pending' AND EXISTS (SELECT 1 FROM public.comments c
        WHERE c.id = b.delivery_id AND c.project_id = NEW.public_key);
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER cleanup_restricted_project_feedback AFTER UPDATE OF widget_private, feedback_access ON public.projects
FOR EACH ROW EXECUTE FUNCTION public.cleanup_restricted_project_feedback();
--> statement-breakpoint
CREATE FUNCTION public.read_public_comments(p_project text, p_page_url text DEFAULT NULL)
RETURNS SETOF public.comments LANGUAGE plpgsql SET search_path = '' AS $$
DECLARE v_private boolean;
BEGIN
  SELECT p.widget_private INTO v_private FROM public.projects p WHERE p.public_key = p_project FOR SHARE;
  IF v_private THEN RAISE EXCEPTION 'private_feedback_login_required'; END IF;
  RETURN QUERY SELECT c.* FROM public.comments c WHERE c.project_id = p_project AND c.visibility = 'shared'
    AND (p_page_url IS NULL OR c.url = p_page_url) ORDER BY c.created_at DESC;
END;
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION public.read_public_comments(text, text) FROM PUBLIC, anon, authenticated;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.read_public_comments(text, text) TO service_role;
--> statement-breakpoint
CREATE FUNCTION public.mutate_public_comment(p_project text, p_comment uuid, p_status text DEFAULT NULL, p_delete boolean DEFAULT false)
RETURNS SETOF public.comments LANGUAGE plpgsql SET search_path = '' AS $$
DECLARE v_private boolean;
BEGIN
  SELECT p.widget_private INTO v_private FROM public.projects p WHERE p.public_key = p_project FOR SHARE;
  IF v_private THEN RAISE EXCEPTION 'private_feedback_login_required'; END IF;
  IF NOT p_delete AND (p_status IS NULL OR p_status NOT IN ('pending', 'approved', 'rejected')) THEN
    RAISE EXCEPTION 'invalid_review_status';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('crrt-github-issue:' || p_project, 0));
  PERFORM 1 FROM public.comments c WHERE c.id = p_comment AND c.project_id = p_project
    AND c.visibility = 'shared' AND c.created_by_user_id IS NULL FOR UPDATE;
  IF NOT FOUND THEN RETURN; END IF;
  IF p_delete THEN
    RETURN QUERY DELETE FROM public.comments c WHERE c.id = p_comment AND c.project_id = p_project RETURNING c.*;
  ELSE
    RETURN QUERY SELECT * FROM public.update_comment_review_status(p_comment, p_project, p_status);
  END IF;
END;
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION public.mutate_public_comment(text, uuid, text, boolean) FROM PUBLIC, anon, authenticated;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.mutate_public_comment(text, uuid, text, boolean) TO service_role;
--> statement-breakpoint
-- A claimed delivery owns a durable fence until its worker checkpoints. A
-- crashed worker is reclaimed by the existing lease/retry mechanism; privacy
-- never silently expires this fence underneath a paused sender.
CREATE FUNCTION public.claim_comment_email_batch(p_id uuid, p_attempts integer, p_next_attempt timestamptz, p_token uuid, p_lease_until timestamptz)
RETURNS boolean LANGUAGE plpgsql SET search_path = '' AS $$
DECLARE v_project text; v_comment uuid;
BEGIN
  SELECT c.project_id, c.id INTO v_project, v_comment FROM public.comment_email_batches b
    JOIN public.comments c ON c.id = b.delivery_id WHERE b.id = p_id;
  PERFORM 1 FROM public.projects p WHERE p.public_key = v_project FOR SHARE;
  PERFORM 1 FROM public.comments c WHERE c.id = v_comment FOR SHARE;
  IF NOT FOUND THEN
    UPDATE public.comment_email_batches b SET status = 'failed', lease_token = NULL, last_error = 'comment_removed'
      WHERE b.id = p_id AND b.status = 'pending' AND b.attempts = p_attempts AND b.next_attempt_at = p_next_attempt;
    RETURN false;
  END IF;
  UPDATE public.comment_email_batches b SET lease_token = p_token, attempts = b.attempts + 1, next_attempt_at = p_lease_until
    WHERE b.id = p_id AND b.status = 'pending' AND b.attempts = p_attempts AND b.next_attempt_at = p_next_attempt;
  RETURN FOUND;
END;
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION public.claim_comment_email_batch(uuid, integer, timestamptz, uuid, timestamptz) FROM PUBLIC, anon, authenticated;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.claim_comment_email_batch(uuid, integer, timestamptz, uuid, timestamptz) TO service_role;
--> statement-breakpoint
CREATE FUNCTION public.fence_project_privacy_delivery()
RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  IF NEW.widget_private AND NEW.feedback_access = 'admins' AND EXISTS (
    SELECT 1 FROM public.comment_email_batches b JOIN public.comments c ON c.id = b.delivery_id
    WHERE c.project_id = NEW.public_key AND b.status = 'pending' AND b.lease_token IS NOT NULL
  ) THEN RAISE EXCEPTION 'feedback_delivery_in_progress'; END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER fence_project_privacy_delivery BEFORE UPDATE OF widget_private, feedback_access ON public.projects
FOR EACH ROW EXECUTE FUNCTION public.fence_project_privacy_delivery();
--> statement-breakpoint
-- Preserve the delivery-to-project association while a sender holds its fence.
CREATE FUNCTION public.fence_comment_delivery_delete()
RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.comment_email_batches b WHERE b.delivery_id = OLD.id
    AND b.status = 'pending' AND b.lease_token IS NOT NULL) THEN RAISE EXCEPTION 'feedback_delivery_in_progress'; END IF;
  RETURN OLD;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER fence_comment_delivery_delete BEFORE DELETE ON public.comments
FOR EACH ROW EXECUTE FUNCTION public.fence_comment_delivery_delete();
