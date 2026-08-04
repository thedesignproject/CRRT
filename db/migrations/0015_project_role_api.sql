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
  IF p_role NOT IN ('owner', 'admin', 'member') THEN
    RETURN jsonb_build_object('status', 'invalid_role');
  END IF;

  -- Serialize membership changes for this project, including ownership
  -- transfer, self-demotion, and removal through remove_project_member.
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

CREATE OR REPLACE FUNCTION public.remove_project_member(p_project_key text, p_user_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_role text;
  v_is_owner boolean;
  v_admin_count integer;
BEGIN
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

  PERFORM 1
  FROM public.project_members AS member
  WHERE member.project_key = p_project_key
  ORDER BY member.user_id
  FOR UPDATE;

  SELECT member.role, member.is_owner
  INTO v_role, v_is_owner
  FROM public.project_members AS member
  WHERE member.project_key = p_project_key AND member.user_id = p_user_id;

  IF v_role IS NULL THEN
    RETURN 'not_found';
  END IF;

  IF v_is_owner THEN
    RETURN 'owner_protected';
  END IF;

  IF v_role = 'admin' THEN
    SELECT count(*)
    INTO v_admin_count
    FROM public.project_members AS member
    WHERE member.project_key = p_project_key AND member.role = 'admin';

    IF v_admin_count <= 1 THEN
      RETURN 'last_admin';
    END IF;
  END IF;

  DELETE FROM public.project_members AS member
  WHERE member.project_key = p_project_key AND member.user_id = p_user_id;

  RETURN 'removed';
END;
$$;--> statement-breakpoint

REVOKE ALL ON FUNCTION public.change_project_member_role(text, uuid, uuid, text) FROM PUBLIC;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.change_project_member_role(text, uuid, uuid, text) TO service_role;
