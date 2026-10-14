-- Foundation: the single connected Instagram account and one-time OAuth states.
-- Every table has RLS enabled and no policies: only the server's service-role key can
-- read or write, and the publishable key in the browser sees nothing.

create table public.instagram_connections (
  id                 smallint primary key default 1 check (id = 1), -- at most one account
  instagram_user_id  text not null,
  username           text not null,
  account_type       text not null,
  access_token_enc   text not null, -- AES-256-GCM, "v1:<iv>:<tag>:<ciphertext>"
  scopes             text[] not null default '{}',
  token_expires_at   timestamptz not null,
  token_refreshed_at timestamptz not null,
  status             text not null default 'active' check (status in ('active', 'needs_reconnect')),
  connected_at       timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

create table public.oauth_states (
  state      text primary key,
  created_at timestamptz not null default now()
);

alter table public.instagram_connections enable row level security;
alter table public.oauth_states enable row level security;

revoke all on public.instagram_connections from anon, authenticated;
revoke all on public.oauth_states from anon, authenticated;
