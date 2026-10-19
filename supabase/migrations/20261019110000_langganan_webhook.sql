-- The automatic webhook subscription (ensureWebhookSubscription): when it succeeded, and when it was last tried,
-- so a failure waits an hour. Split from 20261019100000_balasan_komentar.sql, whose earlier version was already
-- applied without these columns; `if not exists` keeps it safe where the later version ran.
alter table public.instagram_connections
  add column if not exists webhooks_subscribed_at timestamptz,
  add column if not exists webhooks_attempted_at  timestamptz;
