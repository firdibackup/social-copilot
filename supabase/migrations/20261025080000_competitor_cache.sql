-- Intel Kompetitor cache: findCompetitors' sanitized results (public profiles only), shared by every user so a
-- repeated search skips Apify and the daily research slot. A short-lived optimisation, never the source of truth.
-- Same rules as the rest: RLS on with no policies, only the server's service-role key reads or writes.
-- cache_key is `v1:` + SHA-256 of the versioned canonical search (src/lib/apify.ts competitorCacheKey).
create table public.competitor_cache (
  cache_key        text primary key,
  search_kind      text not null check (search_kind in ('username', 'keyword')),
  normalized_query text not null,
  -- Upper bound is MAX_COMPETITORS in src/lib/apify.ts.
  max_results      integer not null check (max_results between 1 and 5),
  result           jsonb not null check (jsonb_typeof(result) = 'array'),
  created_at       timestamptz not null default now(),
  expires_at       timestamptz not null,
  check (expires_at > created_at)
);

-- For the manual cleanup of old rows; an upsert of the same search replaces its row anyway:
--   delete from public.competitor_cache where expires_at < now() - interval '7 days';
create index competitor_cache_expires_at_idx on public.competitor_cache (expires_at);

alter table public.competitor_cache enable row level security;
revoke all on public.competitor_cache from anon, authenticated;
grant all on public.competitor_cache to service_role;
