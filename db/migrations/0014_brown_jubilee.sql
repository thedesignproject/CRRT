ALTER TABLE "project_members" ADD COLUMN "is_owner" boolean DEFAULT false NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "project_members_one_owner_idx" ON "project_members" USING btree ("project_key") WHERE "project_members"."is_owner";--> statement-breakpoint
ALTER TABLE "project_members" ADD CONSTRAINT "project_members_owner_role_check" CHECK (not "project_members"."is_owner" or "project_members"."role" = 'admin');--> statement-breakpoint

-- Give every claimed project one deterministic owner. Current projects have a
-- single admin; ordering also keeps the migration safe if older data contains
-- more than one.
WITH ranked_admins AS (
  SELECT
    member.project_key,
    member.user_id,
    row_number() OVER (
      PARTITION BY member.project_key
      ORDER BY member.created_at, member.user_id
    ) AS position
  FROM public.project_members AS member
  WHERE member.role = 'admin'
    AND NOT EXISTS (
      SELECT 1
      FROM public.project_members AS owner
      WHERE owner.project_key = member.project_key AND owner.is_owner
    )
)
UPDATE public.project_members AS member
SET is_owner = true
FROM ranked_admins AS ranked
WHERE member.project_key = ranked.project_key
  AND member.user_id = ranked.user_id
  AND ranked.position = 1;--> statement-breakpoint

CREATE FUNCTION public.claim_project(
  p_user_id uuid,
  p_project_key text,
  p_name text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_project public.projects%ROWTYPE;
  v_created boolean := false;
BEGIN
  IF p_user_id IS NULL OR p_project_key IS NULL OR p_project_key = '' THEN
    RETURN jsonb_build_object('status', 'invalid_input');
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended('crrt-project-claim:' || p_project_key, 0));

  SELECT project.*
  INTO v_project
  FROM public.projects AS project
  WHERE project.public_key = p_project_key
  FOR UPDATE;

  IF NOT FOUND THEN
    IF p_name IS NULL THEN
      RETURN jsonb_build_object('status', 'not_found');
    END IF;

    BEGIN
      INSERT INTO public.projects (
        public_key,
        slug,
        name,
        allowed_origins,
        claimable
      )
      VALUES (p_project_key, p_project_key, p_name, '{}', false)
      RETURNING * INTO v_project;
      v_created := true;
    EXCEPTION
      WHEN unique_violation THEN
        SELECT project.*
        INTO v_project
        FROM public.projects AS project
        WHERE project.public_key = p_project_key
        FOR UPDATE;

        IF NOT FOUND THEN
          RETURN jsonb_build_object('status', 'already_claimed');
        END IF;
    END;
  END IF;

  PERFORM 1
  FROM public.project_members AS member
  WHERE member.project_key = p_project_key
  ORDER BY member.user_id
  FOR UPDATE;

  IF EXISTS (
    SELECT 1
    FROM public.project_members AS member
    WHERE member.project_key = p_project_key AND member.is_owner
  ) THEN
    RETURN jsonb_build_object('status', 'already_claimed');
  END IF;

  IF NOT v_created THEN
    IF NOT v_project.claimable THEN
      RETURN jsonb_build_object('status', 'already_claimed');
    END IF;

    UPDATE public.projects AS project
    SET claimable = false, updated_at = now()
    WHERE project.public_key = p_project_key
    RETURNING project.* INTO v_project;
  END IF;

  INSERT INTO public.project_repo_configs (project_key, default_branch)
  VALUES (p_project_key, 'main')
  ON CONFLICT (project_key) DO NOTHING;

  INSERT INTO public.project_members (project_key, user_id, role, is_owner)
  VALUES (p_project_key, p_user_id, 'admin', true)
  ON CONFLICT (project_key, user_id) DO UPDATE
  SET role = 'admin', is_owner = true;

  RETURN jsonb_build_object(
    'status', 'claimed',
    'project', jsonb_build_object(
      'public_key', v_project.public_key,
      'slug', v_project.slug,
      'name', v_project.name,
      'allowed_origins', v_project.allowed_origins,
      'created_at', v_project.created_at,
      'updated_at', v_project.updated_at
    )
  );
END;
$$;--> statement-breakpoint

CREATE OR REPLACE FUNCTION public.change_project_member_role(
  p_project_key text,
  p_actor_user_id uuid,
  p_target_user_id uuid,
  p_role text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_actor_role text;
  v_actor_is_owner boolean;
  v_target_role text;
  v_target_is_owner boolean;
  v_previous_role text;
BEGIN
  IF p_role IS NULL OR p_role NOT IN ('owner', 'admin', 'member') THEN
    RETURN jsonb_build_object('status', 'invalid_role');
  END IF;

  PERFORM 1
  FROM public.project_members AS member
  WHERE member.project_key = p_project_key
  ORDER BY member.user_id
  FOR UPDATE;

  SELECT member.role, member.is_owner
  INTO v_actor_role, v_actor_is_owner
  FROM public.project_members AS member
  WHERE member.project_key = p_project_key AND member.user_id = p_actor_user_id;

  IF v_actor_role IS NULL OR v_actor_role <> 'admin' THEN
    RETURN jsonb_build_object('status', 'forbidden');
  END IF;

  SELECT member.role, member.is_owner
  INTO v_target_role, v_target_is_owner
  FROM public.project_members AS member
  WHERE member.project_key = p_project_key AND member.user_id = p_target_user_id;

  IF v_target_role IS NULL THEN
    RETURN jsonb_build_object('status', 'not_found');
  END IF;

  v_previous_role := CASE WHEN v_target_is_owner THEN 'owner' ELSE v_target_role END;
  IF v_previous_role = p_role THEN
    RETURN jsonb_build_object(
      'status', 'unchanged',
      'previousRole', v_previous_role,
      'role', p_role,
      'changed', false
    );
  END IF;

  IF v_target_is_owner THEN
    RETURN jsonb_build_object('status', 'owner_protected');
  END IF;

  IF p_role = 'owner' THEN
    IF NOT v_actor_is_owner THEN
      RETURN jsonb_build_object('status', 'owner_required');
    END IF;

    UPDATE public.project_members AS member
    SET is_owner = false
    WHERE member.project_key = p_project_key AND member.is_owner;

    UPDATE public.project_members AS member
    SET role = 'admin', is_owner = true
    WHERE member.project_key = p_project_key AND member.user_id = p_target_user_id;
  ELSE
    UPDATE public.project_members AS member
    SET role = p_role
    WHERE member.project_key = p_project_key AND member.user_id = p_target_user_id;
  END IF;

  RETURN jsonb_build_object(
    'status', 'updated',
    'previousRole', v_previous_role,
    'role', p_role,
    'changed', true
  );
END;
$$;--> statement-breakpoint

DROP FUNCTION public.remove_project_member(text, uuid);--> statement-breakpoint

CREATE FUNCTION public.remove_project_member(
  p_project_key text,
  p_actor_user_id uuid,
  p_target_user_id uuid
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_actor_role text;
  v_role text;
  v_is_owner boolean;
BEGIN
  PERFORM 1
  FROM public.project_members AS member
  WHERE member.project_key = p_project_key
  ORDER BY member.user_id
  FOR UPDATE;

  SELECT member.role
  INTO v_actor_role
  FROM public.project_members AS member
  WHERE member.project_key = p_project_key AND member.user_id = p_actor_user_id;

  IF v_actor_role IS NULL OR v_actor_role <> 'admin' THEN
    RETURN 'forbidden';
  END IF;

  SELECT member.role, member.is_owner
  INTO v_role, v_is_owner
  FROM public.project_members AS member
  WHERE member.project_key = p_project_key AND member.user_id = p_target_user_id;

  IF v_role IS NULL THEN
    RETURN 'not_found';
  END IF;

  IF v_is_owner THEN
    RETURN 'owner_protected';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended('crrt-github-issue:' || p_project_key, 0));

  UPDATE public.comments AS comment
  SET github_issue_lease_token = NULL, github_issue_lease_expires_at = NULL
  WHERE comment.project_id = p_project_key
    AND comment.github_issue_number IS NULL
    AND comment.github_issue_uncertain_at IS NULL
    AND comment.github_issue_lease_expires_at <= now();

  IF EXISTS (
    SELECT 1
    FROM public.comments AS comment
    WHERE comment.project_id = p_project_key
      AND comment.github_issue_number IS NULL
      AND (
        comment.github_issue_lease_token IS NOT NULL
        OR comment.github_issue_uncertain_at IS NOT NULL
      )
  ) THEN
    RAISE EXCEPTION 'github_issue_creation_in_progress';
  END IF;

  DELETE FROM public.project_members AS member
  WHERE member.project_key = p_project_key AND member.user_id = p_target_user_id;

  RETURN 'removed';
END;
$$;--> statement-breakpoint

REVOKE ALL ON FUNCTION public.claim_project(uuid, text, text) FROM PUBLIC;--> statement-breakpoint
REVOKE ALL ON FUNCTION public.change_project_member_role(text, uuid, uuid, text) FROM PUBLIC;--> statement-breakpoint
REVOKE ALL ON FUNCTION public.remove_project_member(text, uuid, uuid) FROM PUBLIC;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.claim_project(uuid, text, text) TO service_role;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.change_project_member_role(text, uuid, uuid, text) TO service_role;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.remove_project_member(text, uuid, uuid) TO service_role;
