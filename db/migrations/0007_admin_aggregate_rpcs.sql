-- Super-admin aggregate RPCs.
--
-- Replaces two full-table scans that were aggregated in Node:
--   * listAllUsers() pulled every `project_members` row and counted per user.
--   * listProjectsWithComments() pulled every `comments` row and aggregated
--     count + latest-per-project.
-- Both are vulnerable to PostgREST's max-rows cap silently truncating the
-- result, which would make counts/the project set incomplete. Aggregating in
-- the DB keeps the work where the data is and the transferred rows bounded.
--
-- Both run via the service-role client, which bypasses RLS (same as the rest
-- of api/). Mirrors the existing remove_project_member RPC (migration 0003).

-- Comment count + latest comment per project, joined to project metadata,
-- newest-comment-first, bounded by p_limit. Inner join => only projects that
-- have received at least one comment, matching the previous behaviour.
create or replace function admin_projects_with_comments(p_limit int default 100)
returns table (
  public_key text,
  name text,
  claimable boolean,
  created_at timestamptz,
  comment_count bigint,
  latest_comment_at timestamptz
)
language sql
stable
as $$
  select p.public_key, p.name, p.claimable, p.created_at,
         count(c.id) as comment_count,
         max(c.created_at) as latest_comment_at
  from projects p
  join comments c on c.project_id = p.public_key
  group by p.public_key, p.name, p.claimable, p.created_at
  order by latest_comment_at desc
  limit p_limit;
$$;

-- One row per user that belongs to at least one project. Bounded by the number
-- of users, not the number of memberships.
create or replace function admin_user_project_counts()
returns table (
  user_id uuid,
  project_count bigint
)
language sql
stable
as $$
  select user_id, count(*) as project_count
  from project_members
  group by user_id;
$$;
