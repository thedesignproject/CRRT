CREATE TABLE "project_access_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_key" text NOT NULL,
	"user_id" uuid NOT NULL,
	"email" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"attempt" integer DEFAULT 1 NOT NULL,
	"requested_at" timestamp with time zone DEFAULT now() NOT NULL,
	"reviewed_at" timestamp with time zone,
	"reviewed_by" uuid,
	"granted_role" text,
	CONSTRAINT "project_access_requests_status_check" CHECK ("project_access_requests"."status" in ('pending', 'approved', 'declined')),
	CONSTRAINT "project_access_requests_role_check" CHECK ("project_access_requests"."granted_role" in ('admin', 'member', 'guest')),
	CONSTRAINT "project_access_requests_attempt_check" CHECK ("project_access_requests"."attempt" > 0),
	CONSTRAINT "project_access_requests_email_check" CHECK ("project_access_requests"."email" = lower("project_access_requests"."email")),
	CONSTRAINT "project_access_requests_review_check" CHECK (("project_access_requests"."status" = 'pending' and "project_access_requests"."reviewed_at" is null and "project_access_requests"."granted_role" is null) or ("project_access_requests"."status" = 'declined' and "project_access_requests"."reviewed_at" is not null and "project_access_requests"."granted_role" is null) or ("project_access_requests"."status" = 'approved' and "project_access_requests"."reviewed_at" is not null and "project_access_requests"."granted_role" is not null))
);
--> statement-breakpoint
ALTER TABLE "project_access_requests" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "project_email_domains" (
	"project_key" text NOT NULL,
	"domain" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "project_email_domains_project_key_domain_pk" PRIMARY KEY("project_key","domain"),
	CONSTRAINT "project_email_domains_normalized" CHECK ("project_email_domains"."domain" = lower("project_email_domains"."domain") and length("project_email_domains"."domain") <= 253 and "project_email_domains"."domain" ~ '^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)+$')
);
--> statement-breakpoint
ALTER TABLE "project_email_domains" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "project_access_requests" ADD CONSTRAINT "project_access_requests_project_key_projects_public_key_fk" FOREIGN KEY ("project_key") REFERENCES "public"."projects"("public_key") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_access_requests" ADD CONSTRAINT "project_access_requests_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_access_requests" ADD CONSTRAINT "project_access_requests_reviewed_by_users_id_fk" FOREIGN KEY ("reviewed_by") REFERENCES "auth"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_email_domains" ADD CONSTRAINT "project_email_domains_project_key_projects_public_key_fk" FOREIGN KEY ("project_key") REFERENCES "public"."projects"("public_key") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "project_access_requests_user_project_idx" ON "project_access_requests" USING btree ("project_key","user_id");--> statement-breakpoint
CREATE INDEX "project_access_requests_user_idx" ON "project_access_requests" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "project_email_domains_domain_idx" ON "project_email_domains" USING btree ("domain");
--> statement-breakpoint
-- Transactional operations are service-role-only, like the existing membership RPCs.
CREATE FUNCTION public.submit_project_access_request(p_project text, p_user uuid)
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
  RETURN jsonb_build_object('outcome', 'created', 'request', to_jsonb(v_request));
END;
$$;
--> statement-breakpoint
CREATE FUNCTION public.review_project_access_request(p_project text, p_request uuid, p_reviewer uuid, p_decision text, p_role text, p_attempt integer)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_request public.project_access_requests%ROWTYPE;
  v_email text;
  v_role text;
BEGIN
  IF p_decision NOT IN ('approved', 'declined') OR p_decision IS NULL
    OR p_role NOT IN ('admin', 'member', 'guest') OR p_role IS NULL
    OR p_attempt IS NULL OR p_attempt < 1
  THEN RETURN jsonb_build_object('outcome', 'invalid'); END IF;
  PERFORM 1 FROM public.projects WHERE public_key = p_project FOR UPDATE;
  -- Match change_project_member_role/remove_project_member's lock order.
  PERFORM 1 FROM public.project_members WHERE project_key = p_project ORDER BY user_id FOR SHARE;
  PERFORM 1 FROM public.project_members WHERE project_key = p_project
    AND user_id = p_reviewer AND role = 'admin';
  IF NOT FOUND THEN RETURN jsonb_build_object('outcome', 'forbidden'); END IF;
  SELECT * INTO v_request FROM public.project_access_requests
    WHERE id = p_request AND project_key = p_project FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('outcome', 'not_found'); END IF;
  IF v_request.attempt <> p_attempt THEN RETURN jsonb_build_object('outcome', 'stale'); END IF;
  IF v_request.status <> 'pending' THEN
    RETURN jsonb_build_object('outcome', 'resolved', 'request', to_jsonb(v_request));
  END IF;
  IF p_decision = 'approved' THEN
    SELECT lower(email) INTO v_email FROM auth.users
      WHERE id = v_request.user_id AND email_confirmed_at IS NOT NULL FOR SHARE;
    IF v_email IS NULL OR v_email <> v_request.email THEN
      RETURN jsonb_build_object('outcome', 'ineligible');
    END IF;
    PERFORM 1 FROM public.project_email_domains
      WHERE project_key = p_project AND domain = split_part(v_email, '@', 2) FOR SHARE;
    IF NOT FOUND THEN RETURN jsonb_build_object('outcome', 'ineligible'); END IF;
    INSERT INTO public.project_members (project_key, user_id, role)
      VALUES (p_project, v_request.user_id, p_role) ON CONFLICT DO NOTHING;
    SELECT role INTO v_role FROM public.project_members
      WHERE project_key = p_project AND user_id = v_request.user_id FOR SHARE;
  END IF;
  UPDATE public.project_access_requests SET status = p_decision, reviewed_at = now(),
    reviewed_by = p_reviewer, granted_role = v_role WHERE id = p_request RETURNING * INTO v_request;
  RETURN jsonb_build_object('outcome', 'reviewed', 'request', to_jsonb(v_request));
END;
$$;
--> statement-breakpoint
CREATE FUNCTION public.mutate_project_email_domain(p_project text, p_actor uuid, p_domain text, p_remove boolean)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  -- Serialize with discovery/review and hold permission through the write.
  PERFORM 1 FROM public.projects WHERE public_key = p_project FOR UPDATE;
  PERFORM 1 FROM public.project_members WHERE project_key = p_project ORDER BY user_id FOR SHARE;
  PERFORM 1 FROM public.project_members WHERE project_key = p_project AND user_id = p_actor AND role = 'admin';
  IF NOT FOUND THEN RETURN 'forbidden'; END IF;
  IF p_remove THEN
    DELETE FROM public.project_email_domains WHERE project_key = p_project AND domain = p_domain;
  ELSE
    INSERT INTO public.project_email_domains (project_key, domain) VALUES (p_project, p_domain) ON CONFLICT DO NOTHING;
  END IF;
  RETURN 'updated';
END;
$$;
--> statement-breakpoint
CREATE FUNCTION public.suggest_domain_projects(p_user uuid)
RETURNS TABLE (project_key text, name text, domain text, status text, retry_at timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT p.public_key, p.name, d.domain, r.status,
    CASE WHEN r.status = 'declined' THEN r.reviewed_at + interval '7 days' END
  FROM auth.users u
  JOIN public.project_email_domains d ON d.domain = split_part(lower(u.email), '@', 2)
  JOIN public.projects p ON p.public_key = d.project_key
  LEFT JOIN public.project_access_requests r ON r.project_key = p.public_key AND r.user_id = u.id
  WHERE u.id = p_user AND u.email_confirmed_at IS NOT NULL
    AND NOT EXISTS (SELECT 1 FROM public.project_members m WHERE m.project_key = p.public_key AND m.user_id = u.id)
    AND NOT EXISTS (SELECT 1 FROM public.project_invites i WHERE i.project_key = p.public_key AND i.email = lower(u.email))
  ORDER BY p.name, p.public_key;
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION public.submit_project_access_request(text, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.review_project_access_request(text, uuid, uuid, text, text, integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.suggest_domain_projects(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.submit_project_access_request(text, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.review_project_access_request(text, uuid, uuid, text, text, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.suggest_domain_projects(uuid) TO service_role;
REVOKE ALL ON FUNCTION public.mutate_project_email_domain(text, uuid, text, boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.mutate_project_email_domain(text, uuid, text, boolean) TO service_role;
GRANT ALL ON public.project_email_domains, public.project_access_requests TO service_role;
NOTIFY pgrst, 'reload schema';
