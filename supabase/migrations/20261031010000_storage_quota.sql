-- Per-user storage quota. The quota itself lives in the app (src/lib/storage-quota.ts); the database only measures.
-- Counted: the user's objects in `media` and `brand` (paths start with the user's id), except temporary story files.

create function public.storage_used(p_user_id uuid)
returns bigint
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(sum((o.metadata->>'size')::bigint), 0)
    from storage.objects o
   where o.bucket_id in ('media', 'brand')
     and o.name like p_user_id::text || '/%'
     and o.name not like p_user_id::text || '/stories/%';
$$;

-- AI images no post, thread or slide uses: safe to suggest for deletion. Oldest and largest first.
create function public.storage_cleanup_candidates(p_user_id uuid, p_limit integer default 100)
returns table (id uuid, size_bytes integer, created_at timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select a.id, a.size_bytes, a.created_at
    from public.assets a
   where a.user_id = p_user_id
     and a.origin = 'ai'
     and not exists (select 1 from public.post_media m where m.asset_id = a.id)
     and not exists (select 1 from public.thread_item_media t where t.asset_id = a.id)
     and not exists (select 1 from public.post_slides s where s.asset_id = a.id)
   order by a.created_at asc, a.size_bytes desc
   limit least(greatest(p_limit, 1), 500);
$$;

revoke execute on function public.storage_used(uuid) from public, anon, authenticated;
revoke execute on function public.storage_cleanup_candidates(uuid, integer) from public, anon, authenticated;
grant execute on function public.storage_used(uuid) to service_role;
grant execute on function public.storage_cleanup_candidates(uuid, integer) to service_role;

-- Every stored file is compressed below 2 MB first; older self-hosted Storage ignores this, so the server checks too.
update storage.buckets set file_size_limit = 2097152 where id in ('media', 'brand');
