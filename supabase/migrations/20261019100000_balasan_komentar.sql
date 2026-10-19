-- Balasan: read state and avatars for DMs, the connected account's post comments, and the reply_draft AI task.

-- seen_at: when the owner last opened the conversation. It is unread while the customer's last message is newer.
-- profile_pic_url is a signed Instagram CDN link that expires, so the profile is read again after 3 days.
alter table public.dm_conversations
  add column seen_at            timestamptz,
  add column profile_pic_url    text,
  add column profile_fetched_at timestamptz;

-- Conversations from before read state count as read, so the bell starts at the next new message.
update public.dm_conversations set seen_at = last_message_at;

-- Comments on the account's posts, from the comments webhook and from pulling each post's comments. account_id is
-- the account whose post it is (the webhook's entry.id or the pulling token's account), a display filter like the
-- other per-account rows. Replies carry parent_id, the top-level comment they answer; Instagram nests one level.
create table public.ig_comments (
  user_id       uuid not null references auth.users (id) on delete cascade,
  account_id    text not null,
  comment_id    text not null,
  media_id      text not null,
  parent_id     text,
  from_id       text,
  username      text,
  text          text not null default '',
  created_at    timestamptz not null,
  is_hidden     boolean not null default false,
  -- The account's own comments: shown as replies, never counted as new or waiting.
  is_from_owner boolean not null default false,
  -- When the owner first replied publicly after this comment (mark_comment_replies).
  replied_at    timestamptz,
  -- When the owner answered it with a private reply; Instagram allows one.
  dm_sent_at    timestamptz,
  seen_at       timestamptz,
  primary key (user_id, comment_id)
);

create index ig_comments_user_id_account_id_created_at_idx on public.ig_comments (user_id, account_id, created_at desc);
create index ig_comments_user_id_media_id_created_at_idx on public.ig_comments (user_id, media_id, created_at);

-- One row per user and account: when the last pull of comments started.
create table public.comment_syncs (
  user_id    uuid not null references auth.users (id) on delete cascade,
  account_id text not null,
  -- Null after a failed pull, so the next visit tries again.
  started_at timestamptz,
  primary key (user_id, account_id)
);

alter table public.ig_comments enable row level security;
alter table public.comment_syncs enable row level security;
revoke all on public.ig_comments, public.comment_syncs from anon, authenticated;

-- Starts a pull unless one started less than p_cooldown_seconds ago, like claim_analytics_sync.
create function public.claim_comment_sync(p_user_id uuid, p_account_id text, p_cooldown_seconds integer)
returns boolean
language plpgsql
set search_path = ''
as $$
begin
  insert into public.comment_syncs (user_id, account_id, started_at)
  values (p_user_id, p_account_id, now())
  on conflict (user_id, account_id) do update
    set started_at = now()
    where public.comment_syncs.started_at is null
       or public.comment_syncs.started_at < now() - make_interval(secs => p_cooldown_seconds);
  return found;
end;
$$;

-- A comment counts as replied once the owner commented in its thread at or after it: under the top-level comment
-- for that comment and for every reply in it. Run after storing comments of these posts.
create function public.mark_comment_replies(p_user_id uuid, p_media_ids text[])
returns void
language sql
set search_path = ''
as $$
  update public.ig_comments c
     set replied_at = r.replied_at
    from (
      select w.comment_id, min(o.created_at) as replied_at
        from public.ig_comments w
        join public.ig_comments o
          on o.user_id = w.user_id
         and o.is_from_owner
         and o.parent_id = coalesce(w.parent_id, w.comment_id)
         and o.created_at >= w.created_at
       where w.user_id = p_user_id
         and w.media_id = any (p_media_ids)
         and not w.is_from_owner
         and w.replied_at is null
       group by w.comment_id
    ) r
   where c.user_id = p_user_id and c.comment_id = r.comment_id;
$$;

revoke execute on function public.claim_comment_sync(uuid, text, integer) from public, anon, authenticated;
grant execute on function public.claim_comment_sync(uuid, text, integer) to service_role;
revoke execute on function public.mark_comment_replies(uuid, text[]) from public, anon, authenticated;
grant execute on function public.mark_comment_replies(uuid, text[]) to service_role;

-- The ✨ AI button of DM and comment replies.
alter table public.ai_generations drop constraint ai_generations_task_check;
alter table public.ai_generations add constraint ai_generations_task_check check (task in (
  'captions', 'ideas', 'rewrite', 'hashtags', 'image', 'image_plan',
  'brand_profile', 'brand_visual',
  'content', 'content_slide', 'slide_edit', 'caption_edit', 'content_ideas', 'content_script',
  'website_catalog', 'asset_tags',
  'reply_draft'
));
