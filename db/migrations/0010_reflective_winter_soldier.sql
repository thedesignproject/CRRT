CREATE TABLE "project_comment_email_cooldowns" (
	"project_key" text PRIMARY KEY NOT NULL,
	"pending_count" integer DEFAULT 0 NOT NULL,
	"cooldown_until" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "project_comment_email_cooldowns" ADD CONSTRAINT "project_comment_email_cooldowns_project_key_projects_public_key_fk" FOREIGN KEY ("project_key") REFERENCES "public"."projects"("public_key") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "project_comment_email_cooldowns" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "project_comment_email_cooldowns" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
create or replace function reserve_comment_activity_email(p_project_key text, p_cooldown_seconds int)
returns table (
  should_send boolean,
  activity_count int
)
language plpgsql
as $$
declare
  v_now timestamptz := now();
  v_cooldown_until timestamptz;
  v_pending_count int;
begin
  insert into project_comment_email_cooldowns (
    project_key,
    pending_count,
    cooldown_until,
    updated_at
  )
  values (
    p_project_key,
    0,
    v_now + make_interval(secs => greatest(p_cooldown_seconds, 0)),
    v_now
  )
  on conflict (project_key) do nothing;

  if found then
    return query select true, 1;
    return;
  end if;

  select cooldown_until, pending_count
    into v_cooldown_until, v_pending_count
    from project_comment_email_cooldowns
    where project_key = p_project_key
    for update;

  if v_cooldown_until is null or v_cooldown_until <= v_now then
    update project_comment_email_cooldowns
      set pending_count = 0,
          cooldown_until = v_now + make_interval(secs => greatest(p_cooldown_seconds, 0)),
          updated_at = v_now
      where project_key = p_project_key;

    return query select true, v_pending_count + 1;
    return;
  end if;

  update project_comment_email_cooldowns
    set pending_count = pending_count + 1,
        updated_at = v_now
    where project_key = p_project_key;

  return query select false, 0;
end;
$$;
--> statement-breakpoint
create or replace function release_comment_activity_email_reservation(p_project_key text, p_activity_count int)
returns void
language plpgsql
as $$
declare
  v_now timestamptz := now();
begin
  update project_comment_email_cooldowns
    set pending_count = pending_count + greatest(p_activity_count, 1),
        cooldown_until = null,
        updated_at = v_now
    where project_key = p_project_key;
end;
$$;
