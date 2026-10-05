ALTER TABLE "projects" ADD CONSTRAINT "projects_feedback_access_check" CHECK ("projects"."feedback_access" in ('team', 'admins'));
--> statement-breakpoint

CREATE OR REPLACE FUNCTION public.project_feedback_allowed(p_project text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.projects p JOIN public.project_members m ON m.project_key = p.public_key
    WHERE p.public_key = p_project AND m.user_id = auth.uid()
      AND (NOT p.widget_private OR p.feedback_access = 'team'
        OR (p.feedback_access = 'admins' AND (m.role = 'admin' OR m.is_owner)))
  );
$$;
--> statement-breakpoint
-- Project-first locking matches email claims and privacy commits. Preserve the
-- existing RPC authorization/owner protections behind service-only wrappers.
ALTER FUNCTION public.change_project_member_role(text, uuid, uuid, text) RENAME TO change_project_member_role_unfenced;
--> statement-breakpoint
ALTER FUNCTION public.remove_project_member(text, uuid, uuid) RENAME TO remove_project_member_unfenced;
--> statement-breakpoint
CREATE FUNCTION public.change_project_member_role(p_project_key text, p_actor_user_id uuid, p_target_user_id uuid, p_role text)
RETURNS jsonb LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  PERFORM 1 FROM public.projects p WHERE p.public_key = p_project_key FOR UPDATE;
  RETURN public.change_project_member_role_unfenced(p_project_key, p_actor_user_id, p_target_user_id, p_role);
END;
$$;
--> statement-breakpoint
CREATE FUNCTION public.remove_project_member(p_project_key text, p_actor_user_id uuid, p_target_user_id uuid)
RETURNS text LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  PERFORM 1 FROM public.projects p WHERE p.public_key = p_project_key FOR UPDATE;
  RETURN public.remove_project_member_unfenced(p_project_key, p_actor_user_id, p_target_user_id);
END;
$$;
--> statement-breakpoint
CREATE FUNCTION public.fence_project_member_delivery()
RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  PERFORM 1 FROM public.projects p WHERE p.public_key = OLD.project_key FOR UPDATE;
  IF EXISTS (SELECT 1 FROM public.comment_email_batches b JOIN public.comments c ON c.id = b.delivery_id
    WHERE c.project_id = OLD.project_key AND b.status = 'pending' AND b.lease_token IS NOT NULL
  ) THEN RAISE EXCEPTION 'feedback_delivery_in_progress'; END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER fence_project_member_delivery BEFORE DELETE OR UPDATE OF role, is_owner, user_id, project_key ON public.project_members
FOR EACH ROW EXECUTE FUNCTION public.fence_project_member_delivery();
--> statement-breakpoint
CREATE FUNCTION public.update_project_settings(p_project text, p_actor uuid, p_patch jsonb)
RETURNS SETOF public.projects LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  PERFORM 1 FROM public.projects p WHERE p.public_key = p_project FOR UPDATE;
  IF NOT FOUND THEN RETURN; END IF;
  PERFORM 1 FROM public.project_members m WHERE m.project_key = p_project AND m.user_id = p_actor AND m.role = 'admin' FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'forbidden'; END IF;
  RETURN QUERY UPDATE public.projects p SET
    name = CASE WHEN p_patch ? 'name' THEN p_patch->>'name' ELSE p.name END,
    allowed_origins = CASE WHEN p_patch ? 'allowed_origins' THEN ARRAY(SELECT jsonb_array_elements_text(p_patch->'allowed_origins')) ELSE p.allowed_origins END,
    widget_private = CASE WHEN p_patch ? 'widget_private' THEN (p_patch->>'widget_private')::boolean ELSE p.widget_private END,
    feedback_access = CASE WHEN p_patch ? 'feedback_access' THEN p_patch->>'feedback_access' ELSE p.feedback_access END,
    updated_at = now()
    WHERE p.public_key = p_project RETURNING p.*;
END;
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION public.change_project_member_role(text, uuid, uuid, text), public.remove_project_member(text, uuid, uuid),
  public.change_project_member_role_unfenced(text, uuid, uuid, text), public.remove_project_member_unfenced(text, uuid, uuid),
  public.update_project_settings(text, uuid, jsonb) FROM PUBLIC, anon, authenticated;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.change_project_member_role(text, uuid, uuid, text), public.remove_project_member(text, uuid, uuid),
  public.change_project_member_role_unfenced(text, uuid, uuid, text), public.remove_project_member_unfenced(text, uuid, uuid),
  public.update_project_settings(text, uuid, jsonb) TO service_role;
