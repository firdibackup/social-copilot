-- When the last pull of DMs from Instagram started (syncConversations), for its 10-minute cooldown. Null after a
-- failed pull and after connecting an account, so the next visit pulls.
alter table public.instagram_connections
  add column if not exists dms_synced_at timestamptz;
