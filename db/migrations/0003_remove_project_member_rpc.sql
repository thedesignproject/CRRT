-- Atomic last-admin-safe member removal.
--
-- Replaces the read-count-then-delete sequence in `removeProjectMember`, which
-- could race: two concurrent admin removals each saw two admins, both passed the
-- guard, and both deleted — orphaning the project with zero admins.
--
-- The lock is what makes this safe: when removing an admin we `for update` every
-- admin row of the project before counting. Two concurrent admin removals now
-- serialize on that lock — the second waker re-reads after the first commits,
-- sees one admin left, and returns 'last_admin' instead of deleting.
--
-- Returns: 'not_found' (no such member), 'last_admin' (would orphan), 'removed'.
create or replace function remove_project_member(p_project_key text, p_user_id uuid)
returns text
language plpgsql
as $$
declare
  v_role text;
  v_admin_count int;
begin
  select role into v_role
    from project_members
    where project_key = p_project_key and user_id = p_user_id;

  if v_role is null then
    return 'not_found';
  end if;

  if v_role = 'admin' then
    -- Lock all admin rows for the project so concurrent admin removals serialize.
    perform 1
      from project_members
      where project_key = p_project_key and role = 'admin'
      for update;

    select count(*) into v_admin_count
      from project_members
      where project_key = p_project_key and role = 'admin';

    if v_admin_count <= 1 then
      return 'last_admin';
    end if;
  end if;

  delete from project_members
    where project_key = p_project_key and user_id = p_user_id;

  return 'removed';
end;
$$;
