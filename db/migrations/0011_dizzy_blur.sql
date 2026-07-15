ALTER TABLE "notifications" DROP CONSTRAINT "notifications_kind_check";--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_kind_check" CHECK ("notifications"."kind" in ('invite.received', 'invite.accepted', 'invite.declined', 'comment.activity') and ("notifications"."kind" <> 'comment.activity' or nullif(btrim("notifications"."payload"->>'projectKey'), '') is not null));
--> statement-breakpoint
CREATE UNIQUE INDEX "notifications_unread_comment_activity_project_idx" ON "notifications" USING btree ("user_id",((payload->>'projectKey'))) WHERE "notifications"."kind" = 'comment.activity' and "notifications"."read_at" is null;
--> statement-breakpoint
create or replace function create_or_increment_comment_activity_notification(
  p_user_id uuid,
  p_project_key text,
  p_project_name text,
  p_comment_id uuid,
  p_author_name text,
  p_page_url text
)
returns table (
  id uuid,
  user_id uuid,
  kind text,
  payload jsonb,
  read_at timestamptz,
  created_at timestamptz
)
language plpgsql
as $$
declare
  v_now timestamptz := now();
  v_existing_id uuid;
  v_existing_payload jsonb;
  v_next_count int;
begin
  if p_project_key is null or nullif(btrim(p_project_key), '') is null then
    raise exception 'project key is required for comment activity notifications';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_user_id::text || ':' || p_project_key, 0));

  select n.id, n.payload
    into v_existing_id, v_existing_payload
    from notifications n
    where n.user_id = p_user_id
      and n.kind = 'comment.activity'
      and n.read_at is null
      and n.payload->>'projectKey' = p_project_key
    order by n.created_at desc
    limit 1
    for update;

  if v_existing_id is not null then
    v_next_count := coalesce((v_existing_payload->>'count')::int, 1) + 1;

    return query
      update notifications n
        set payload = jsonb_build_object(
              'projectKey', p_project_key,
              'projectName', p_project_name,
              'count', v_next_count,
              'latestCommentId', p_comment_id,
              'latestAuthorName', p_author_name,
              'pageUrl', p_page_url
            ),
            created_at = v_now
        where n.id = v_existing_id
        returning n.id, n.user_id, n.kind, n.payload, n.read_at, n.created_at;
    return;
  end if;

  return query
    insert into notifications (user_id, kind, payload, created_at)
    values (
      p_user_id,
      'comment.activity',
      jsonb_build_object(
        'projectKey', p_project_key,
        'projectName', p_project_name,
        'count', 1,
        'latestCommentId', p_comment_id,
        'latestAuthorName', p_author_name,
        'pageUrl', p_page_url
      ),
      v_now
    )
    returning notifications.id, notifications.user_id, notifications.kind,
      notifications.payload, notifications.read_at, notifications.created_at;
end;
$$;
