ALTER TABLE "notifications" DROP CONSTRAINT "notifications_kind_check";--> statement-breakpoint
CREATE UNIQUE INDEX "notifications_access_request_attempt_idx" ON "notifications" USING btree ("user_id",((payload->>'requestId')),((payload->>'attempt'))) WHERE "notifications"."kind" = 'project.access_requested';--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_kind_check" CHECK ("notifications"."kind" in ('invite.received', 'invite.accepted', 'invite.declined', 'comment.activity', 'project.access_requested') and ("notifications"."kind" not in ('comment.activity', 'project.access_requested') or nullif(btrim("notifications"."payload"->>'projectKey'), '') is not null));
--> statement-breakpoint
CREATE OR REPLACE FUNCTION public.submit_project_access_request(p_project text, p_user uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_email text;
  v_request public.project_access_requests%ROWTYPE;
BEGIN
  PERFORM 1 FROM public.projects WHERE public_key = p_project FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('outcome', 'ineligible'); END IF;
  SELECT lower(email) INTO v_email FROM auth.users
    WHERE id = p_user AND email_confirmed_at IS NOT NULL FOR SHARE;
  IF v_email IS NULL THEN RETURN jsonb_build_object('outcome', 'unverified'); END IF;
  PERFORM 1 FROM public.project_email_domains
    WHERE project_key = p_project AND domain = split_part(v_email, '@', 2) FOR SHARE;
  IF NOT FOUND THEN RETURN jsonb_build_object('outcome', 'ineligible'); END IF;
  IF EXISTS (SELECT 1 FROM public.project_members WHERE project_key = p_project AND user_id = p_user)
    OR EXISTS (SELECT 1 FROM public.project_invites WHERE project_key = p_project AND email = v_email)
  THEN RETURN jsonb_build_object('outcome', 'already_has_access'); END IF;
  SELECT * INTO v_request FROM public.project_access_requests
    WHERE project_key = p_project AND user_id = p_user FOR UPDATE;
  IF FOUND THEN
    IF v_request.status = 'pending' THEN
      RETURN jsonb_build_object('outcome', 'existing', 'request', to_jsonb(v_request));
    END IF;
    IF v_request.status = 'declined' AND v_request.reviewed_at > now() - interval '7 days' THEN
      RETURN jsonb_build_object('outcome', 'cooldown');
    END IF;
    UPDATE public.project_access_requests SET status = 'pending', email = v_email,
      attempt = attempt + 1, requested_at = now(), reviewed_at = null, reviewed_by = null, granted_role = null
      WHERE id = v_request.id RETURNING * INTO v_request;
  ELSE
    INSERT INTO public.project_access_requests (project_key, user_id, email)
      VALUES (p_project, p_user, v_email) RETURNING * INTO v_request;
  END IF;
  -- Persist once per submitted attempt in the same transaction as the request.
  INSERT INTO public.notifications (user_id, kind, payload)
    SELECT m.user_id, 'project.access_requested', jsonb_build_object(
      'projectKey', p_project, 'projectName', p.name, 'email', v_request.email,
      'requestId', v_request.id, 'attempt', v_request.attempt)
    FROM public.project_members m JOIN public.projects p ON p.public_key = m.project_key
    WHERE m.project_key = p_project AND m.role = 'admin'
    ON CONFLICT DO NOTHING;
  RETURN jsonb_build_object('outcome', 'created', 'request', to_jsonb(v_request));
END;
$$;
--> statement-breakpoint
-- Existing pending requests become visible in the notification bell on rollout.
INSERT INTO public.notifications (user_id, kind, payload)
SELECT m.user_id, 'project.access_requested', jsonb_build_object(
  'projectKey', r.project_key, 'projectName', p.name, 'email', r.email,
  'requestId', r.id, 'attempt', r.attempt)
FROM public.project_access_requests r
JOIN public.projects p ON p.public_key = r.project_key
JOIN public.project_members m ON m.project_key = r.project_key AND m.role = 'admin'
JOIN public.project_email_domains d ON d.project_key = r.project_key AND d.domain = split_part(r.email, '@', 2)
JOIN auth.users u ON u.id = r.user_id AND lower(u.email) = r.email AND u.email_confirmed_at IS NOT NULL
WHERE r.status = 'pending'
  AND NOT EXISTS (SELECT 1 FROM public.project_members existing WHERE existing.project_key = r.project_key AND existing.user_id = r.user_id)
  AND NOT EXISTS (SELECT 1 FROM public.project_invites i WHERE i.project_key = r.project_key AND i.email = r.email)
ON CONFLICT DO NOTHING;
