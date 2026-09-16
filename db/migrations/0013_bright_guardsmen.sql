ALTER TABLE "comments" ADD COLUMN "github_issue_number" integer;--> statement-breakpoint
ALTER TABLE "comments" ADD COLUMN "github_issue_url" text;--> statement-breakpoint
ALTER TABLE "comments" ADD COLUMN "github_issue_created_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "comments" ADD COLUMN "github_issue_lease_token" uuid;--> statement-breakpoint
ALTER TABLE "comments" ADD COLUMN "github_issue_lease_expires_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "comments" ADD COLUMN "github_issue_uncertain_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "comments" ADD CONSTRAINT "comments_github_issue_fields_check" CHECK ((
        ("comments"."github_issue_number" is null and "comments"."github_issue_url" is null and "comments"."github_issue_created_at" is null)
        or
        ("comments"."github_issue_number" > 0 and "comments"."github_issue_url" is not null and "comments"."github_issue_created_at" is not null)
      ));--> statement-breakpoint
ALTER TABLE "comments" ADD CONSTRAINT "comments_github_issue_lease_check" CHECK ((
        ("comments"."github_issue_lease_token" is null and "comments"."github_issue_lease_expires_at" is null)
        or
        ("comments"."github_issue_lease_token" is not null and "comments"."github_issue_lease_expires_at" is not null)
      ));--> statement-breakpoint
ALTER TABLE "comments" ADD CONSTRAINT "comments_github_issue_state_check" CHECK ((
        ("comments"."github_issue_number" is null)
        or
        ("comments"."github_issue_lease_token" is null and "comments"."github_issue_uncertain_at" is null)
      ));--> statement-breakpoint

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
		AND comment.status = 'approved'
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
$$;--> statement-breakpoint

CREATE OR REPLACE FUNCTION public.finalize_comment_github_issue(
	p_comment_id uuid,
	p_project_key text,
	p_lease_token uuid,
	p_issue_number integer,
	p_issue_url text,
	p_issue_created_at timestamp with time zone
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
		github_issue_number = p_issue_number,
		github_issue_url = p_issue_url,
		github_issue_created_at = p_issue_created_at,
		github_issue_lease_token = NULL,
		github_issue_lease_expires_at = NULL,
		github_issue_uncertain_at = NULL
	WHERE comment.id = p_comment_id
		AND comment.project_id = p_project_key
		AND comment.status = 'approved'
		AND comment.github_issue_lease_token = p_lease_token
		AND comment.github_issue_number IS NULL;

	GET DIAGNOSTICS v_updated = ROW_COUNT;
	RETURN v_updated = 1;
END;
$$;--> statement-breakpoint

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
$$;--> statement-breakpoint

CREATE OR REPLACE FUNCTION public.mark_comment_github_issue_uncertain(
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
		github_issue_uncertain_at = COALESCE(comment.github_issue_uncertain_at, now())
	WHERE comment.id = p_comment_id
		AND comment.project_id = p_project_key
		AND comment.status = 'approved'
		AND comment.github_issue_lease_token = p_lease_token
		AND comment.github_issue_number IS NULL;

	GET DIAGNOSTICS v_updated = ROW_COUNT;
	RETURN v_updated = 1;
END;
$$;--> statement-breakpoint

CREATE OR REPLACE FUNCTION public.reset_comment_github_issue_attempt(
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
		github_issue_lease_expires_at = NULL,
		github_issue_uncertain_at = NULL
	WHERE comment.id = p_comment_id
		AND comment.project_id = p_project_key
		AND comment.status = 'approved'
		AND comment.github_issue_lease_token = p_lease_token
		AND comment.github_issue_number IS NULL;

	GET DIAGNOSTICS v_updated = ROW_COUNT;
	RETURN v_updated = 1;
END;
$$;--> statement-breakpoint

CREATE OR REPLACE FUNCTION public.update_comment_review_status(
	p_comment_id uuid,
	p_project_key text,
	p_status text
)
RETURNS SETOF public.comments
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
	IF p_status NOT IN ('pending', 'approved', 'rejected') THEN
		RAISE EXCEPTION 'invalid_review_status';
	END IF;

	PERFORM pg_advisory_xact_lock(hashtextextended('crrt-github-issue:' || p_project_key, 0));

	IF p_status <> 'approved' AND EXISTS (
		SELECT 1
		FROM public.comments AS comment
		WHERE comment.id = p_comment_id
			AND comment.project_id = p_project_key
			AND (
				comment.github_issue_lease_token IS NOT NULL
				OR comment.github_issue_uncertain_at IS NOT NULL
			)
	) THEN
		RAISE EXCEPTION 'github_issue_creation_in_progress';
	END IF;

	RETURN QUERY
	UPDATE public.comments AS comment
	SET status = p_status, updated_at = now()
	WHERE comment.id = p_comment_id
		AND comment.project_id = p_project_key
	RETURNING comment.*;
END;
$$;--> statement-breakpoint

CREATE OR REPLACE FUNCTION public.write_github_repo_connection_if_admin(
	p_project_key text,
	p_user_id uuid,
	p_expected_version integer,
	p_repo_url text,
	p_github_owner text,
	p_github_repo text,
	p_github_installation_id text
)
RETURNS SETOF public.project_repo_configs
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
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

	RETURN QUERY
	UPDATE public.project_repo_configs AS config
	SET
		repo_url = p_repo_url,
		github_owner = p_github_owner,
		github_repo = p_github_repo,
		github_installation_id = p_github_installation_id,
		github_connection_version = config.github_connection_version + 1,
		updated_at = now()
	WHERE config.project_key = p_project_key
		AND config.github_connection_version = p_expected_version
		AND EXISTS (
			SELECT 1
			FROM public.project_members AS member
			WHERE member.project_key = config.project_key
				AND member.user_id = p_user_id
				AND member.role = 'admin'
		)
	RETURNING config.*;
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

	SELECT member.role
	INTO v_role
	FROM public.project_members AS member
	WHERE member.project_key = p_project_key AND member.user_id = p_user_id;

	IF v_role IS NULL THEN
		RETURN 'not_found';
	END IF;

	IF v_role = 'admin' THEN
		PERFORM 1
		FROM public.project_members AS member
		WHERE member.project_key = p_project_key AND member.role = 'admin'
		FOR UPDATE;

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

REVOKE ALL ON FUNCTION public.claim_comment_github_issue(uuid, text, uuid, integer, boolean) FROM PUBLIC;--> statement-breakpoint
REVOKE ALL ON FUNCTION public.finalize_comment_github_issue(uuid, text, uuid, integer, text, timestamp with time zone) FROM PUBLIC;--> statement-breakpoint
REVOKE ALL ON FUNCTION public.release_comment_github_issue(uuid, text, uuid) FROM PUBLIC;--> statement-breakpoint
REVOKE ALL ON FUNCTION public.mark_comment_github_issue_uncertain(uuid, text, uuid) FROM PUBLIC;--> statement-breakpoint
REVOKE ALL ON FUNCTION public.reset_comment_github_issue_attempt(uuid, text, uuid) FROM PUBLIC;--> statement-breakpoint
REVOKE ALL ON FUNCTION public.update_comment_review_status(uuid, text, text) FROM PUBLIC;--> statement-breakpoint
REVOKE ALL ON FUNCTION public.write_github_repo_connection_if_admin(text, uuid, integer, text, text, text, text) FROM PUBLIC;--> statement-breakpoint
REVOKE ALL ON FUNCTION public.remove_project_member(text, uuid) FROM PUBLIC;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.claim_comment_github_issue(uuid, text, uuid, integer, boolean) TO service_role;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.finalize_comment_github_issue(uuid, text, uuid, integer, text, timestamp with time zone) TO service_role;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.release_comment_github_issue(uuid, text, uuid) TO service_role;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.mark_comment_github_issue_uncertain(uuid, text, uuid) TO service_role;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.reset_comment_github_issue_attempt(uuid, text, uuid) TO service_role;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.update_comment_review_status(uuid, text, text) TO service_role;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.write_github_repo_connection_if_admin(text, uuid, integer, text, text, text, text) TO service_role;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.remove_project_member(text, uuid) TO service_role;
