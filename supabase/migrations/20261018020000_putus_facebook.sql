-- Putuskan Instagram also removes every Facebook Page token of the user: a Page token is only reachable through the
-- connected Instagram account, so one left behind could no longer be removed from the app.
create or replace function public.disconnect_instagram(p_user_id uuid)
returns integer
language plpgsql
set search_path = ''
as $$
declare
  v_account text;
  v_drafted integer := 0;
begin
  select instagram_user_id into v_account from public.instagram_connections where user_id = p_user_id for update;
  if v_account is not null then
    v_drafted := public.draft_scheduled_posts(p_user_id, v_account);
  end if;
  delete from public.instagram_connections where user_id = p_user_id;
  delete from public.facebook_connections where user_id = p_user_id;
  return v_drafted;
end;
$$;

-- Page tokens left behind by earlier disconnects or account switches.
delete from public.facebook_connections f
 where not exists (
   select 1 from public.instagram_connections c
    where c.user_id = f.user_id and c.instagram_user_id = f.instagram_user_id
 );

revoke execute on function public.disconnect_instagram(uuid) from public, anon, authenticated;
grant execute on function public.disconnect_instagram(uuid) to service_role;
