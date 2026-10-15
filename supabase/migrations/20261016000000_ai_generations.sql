-- Buat AI: one row per request sent to 9Router, read back for the 24-hour usage limit and for debugging.
-- Same rules as the other tables: RLS on with no policies, so only the server's service-role key can
-- read or write.

create table public.ai_generations (
  id          bigint generated always as identity primary key,
  task        text not null check (task in ('captions', 'ideas', 'rewrite', 'hashtags')),
  input       jsonb not null,               -- the validated request
  output      jsonb,                        -- options shown to the owner; null when the request failed
  model       text not null,                -- ROUTER_MODEL at the time
  status      text not null check (status in ('ok', 'failed')),
  error       text,
  duration_ms integer not null check (duration_ms >= 0),
  created_at  timestamptz not null default now()
);

create index ai_generations_created_at_idx on public.ai_generations (created_at);

alter table public.ai_generations enable row level security;

revoke all on public.ai_generations from anon, authenticated;
revoke all on sequence public.ai_generations_id_seq from anon, authenticated;
