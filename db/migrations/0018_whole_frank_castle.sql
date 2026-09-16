ALTER TABLE "project_invites" DROP CONSTRAINT "project_invites_role_check";--> statement-breakpoint
ALTER TABLE "project_members" DROP CONSTRAINT "project_members_role_check";--> statement-breakpoint
ALTER TABLE "project_invites" ADD CONSTRAINT "project_invites_role_check" CHECK ("project_invites"."role" in ('admin', 'member', 'guest'));--> statement-breakpoint
ALTER TABLE "project_members" ADD CONSTRAINT "project_members_role_check" CHECK ("project_members"."role" in ('admin', 'member', 'guest'));--> statement-breakpoint

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
  IF p_role IS NULL OR p_role NOT IN ('owner', 'admin', 'member', 'guest') THEN
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

REVOKE ALL ON FUNCTION public.change_project_member_role(text, uuid, uuid, text) FROM PUBLIC;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.change_project_member_role(text, uuid, uuid, text) TO service_role;
