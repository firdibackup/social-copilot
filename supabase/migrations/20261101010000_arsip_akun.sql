-- Hapus akun: the account is archived, not deleted. Its rows stay where they are; the app then soft-deletes the
-- Supabase Auth user (deleteUser(id, true)), which obfuscates the email and identities but keeps auth.users, so no
-- `on delete cascade` fires. Signing in again with the same email or Google account makes a new, empty user.
-- Same rules as the other tables: RLS on with no policies, so only the server's service-role key can read or write.

-- What the account was, kept apart from auth.users: no foreign key, so the record outlives an admin purge too.
create table public.account_archives (
  user_id            uuid primary key,
  email              text not null,
  instagram_username text,
  threads_username   text,
  active_until       timestamptz, -- end of the last paid period, past or future
  archived_at        timestamptz not null default now()
);

alter table public.account_archives enable row level security;
revoke all on public.account_archives from anon, authenticated;
grant all on public.account_archives to service_role;

-- One transaction, safe to call twice: records the archive, cancels the AI work still queued, frees the Instagram
-- and Threads accounts for the new user (both are unique per connection), takes every post off the schedule, and
-- closes unfinished checkouts. Locks follow cancel_generation's order: job, post, slides.
create function public.archive_account(p_user_id uuid, p_email text)
returns void
language plpgsql
set search_path = ''
as $$
begin
  perform pg_advisory_xact_lock(hashtextextended(p_user_id::text, 0));

  -- Before disconnect_instagram removes the connections the usernames come from.
  insert into public.account_archives (user_id, email, instagram_username, threads_username, active_until)
  values (
    p_user_id,
    p_email,
    (select username from public.instagram_connections where user_id = p_user_id),
    (select username from public.threads_connections where user_id = p_user_id),
    (select max(period_end) from public.payments where user_id = p_user_id and status = 'paid')
  )
  on conflict (user_id) do nothing;

  -- A running worker sees its lease gone and stops before it spends credits or saves anything.
  update public.content_jobs set status = 'cancelled', lease = null, error = null
   where user_id = p_user_id and status in ('pending', 'running');

  perform public.disconnect_instagram(p_user_id);

  -- Scheduled posts of every account, not only the connected one, and retries waiting on next_attempt_at.
  -- arm_threads disarms their Threads versions.
  update public.posts set status = 'draft', next_attempt_at = null, updated_at = now()
   where user_id = p_user_id and status = 'scheduled';
  -- A Threads version or Story still waiting after its post went out.
  update public.post_threads set due_at = null, next_attempt_at = null, updated_at = now()
   where user_id = p_user_id and status = 'pending';
  update public.post_stories set due_at = null, next_attempt_at = null, updated_at = now()
   where user_id = p_user_id and status = 'pending';

  update public.post_slides set status = 'cancelled', lease = null, error = null, next_attempt_at = null, updated_at = now()
   where user_id = p_user_id and status in ('pending', 'generating');
  update public.slide_edit_jobs set status = 'cancelled'
   where user_id = p_user_id and status = 'running';

  -- The Mayar webhook still confirms an expired row Mayar reports paid (late payments are honoured), so a
  -- link paid after this starts a period on the archived user. That money is a refund; nothing reaches a new account.
  update public.payments set status = 'expired', checkout_key = null
   where user_id = p_user_id and status = 'pending';
end;
$$;

revoke execute on function public.archive_account(uuid, text) from public, anon, authenticated;
grant execute on function public.archive_account(uuid, text) to service_role;
