CREATE VIEW "public"."admin_project_metrics" WITH (security_invoker = true) AS (
    with comment_metrics as (
      select project_id,
        count(*)::bigint as comment_count,
        count(*) filter (where status is null or status not in ('approved', 'accepted', 'rejected'))::bigint as pending_comment_count,
        count(*) filter (where status in ('approved', 'accepted'))::bigint as accepted_comment_count,
        count(*) filter (where status = 'rejected')::bigint as rejected_comment_count,
        count(*) filter (where implementation_status is null or implementation_status = 'unassigned')::bigint as unassigned_comment_count,
        count(*) filter (where implementation_status = 'claimed')::bigint as claimed_comment_count,
        count(*) filter (where implementation_status = 'in_progress')::bigint as in_progress_comment_count,
        count(*) filter (where implementation_status = 'blocked')::bigint as blocked_comment_count,
        count(*) filter (where implementation_status = 'done')::bigint as done_comment_count,
        count(distinct url)::bigint as commented_url_count,
        min(created_at) as first_comment_at,
        max(created_at) as last_comment_at
      from "comments"
      group by project_id
    ), share_metrics as (
      select project_id, count(*)::bigint as feedback_share_count
      from "feedback_shares"
      group by project_id
    )
    select p.public_key, p.name, p.claimable, p.created_at,
      cm.comment_count, cm.pending_comment_count, cm.accepted_comment_count,
      cm.rejected_comment_count, cm.unassigned_comment_count,
      cm.claimed_comment_count, cm.in_progress_comment_count,
      cm.blocked_comment_count, cm.done_comment_count,
      coalesce(sm.feedback_share_count, 0)::bigint as feedback_share_count,
      cm.commented_url_count, cm.first_comment_at, cm.last_comment_at
    from "projects" p
    join comment_metrics cm on cm.project_id = p.public_key
    left join share_metrics sm on sm.project_id = p.public_key
  );--> statement-breakpoint
CREATE VIEW "public"."admin_user_metrics" WITH (security_invoker = true) AS (
    with user_ids as (
      select user_id from "project_members"
      union
      select user_id from "super_admins"
    )
    select u.user_id,
      count(pm.project_key) filter (where pm.role = 'admin')::bigint as admin_project_count,
      count(pm.project_key) filter (where pm.role = 'member')::bigint as member_project_count,
      (sa.user_id is not null) as super_admin
    from user_ids u
    left join "project_members" pm on pm.user_id = u.user_id
    left join "super_admins" sa on sa.user_id = u.user_id
    group by u.user_id, sa.user_id
  );