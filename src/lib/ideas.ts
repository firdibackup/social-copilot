import 'server-only'
import type { SuggestedIdea } from './content-ai'
import { parseScript, type ScriptSlide } from './script-options'
import { db, unwrap } from './supabase'

// ponytail: the newest 30 ideas and 20 post titles; paginate if the list outgrows them.
const LIST_LIMIT = 30
const RECENT_POSTS = 20

export interface Idea {
  id: string
  title: string
  pillarId: string | null
  /** The slide-by-slide script written from the idea, once the owner asked for one. */
  script: ScriptSlide[] | null
}

interface IdeaRow {
  id: string
  title: string
  pillar_id: string | null
  script: unknown
}

/** A stored script that no longer passes the checks is dropped rather than failing the page. */
const toIdea = (row: IdeaRow): Idea => {
  const parsed = row.script === null ? null : parseScript(row.script)
  return { id: row.id, title: row.title, pillarId: row.pillar_id, script: parsed && 'script' in parsed ? parsed.script : null }
}

/** The account's ideas, newest first. */
export async function listIdeas(userId: string, accountId: string): Promise<Idea[]> {
  const rows = unwrap(
    await db()
      .from('content_ideas')
      .select('id, title, pillar_id, script')
      .eq('user_id', userId)
      .eq('account_id', accountId)
      .order('created_at', { ascending: false })
      .limit(LIST_LIMIT),
  ) as IdeaRow[]
  return rows.map(toIdea)
}

export async function getIdea(userId: string, id: string): Promise<Idea | null> {
  const row = unwrap(
    await db().from('content_ideas').select('id, title, pillar_id, script').eq('id', id).eq('user_id', userId).maybeSingle(),
  ) as IdeaRow | null
  return row ? toIdea(row) : null
}

/** An idea only when it belongs to the Instagram account whose chat is open. */
export async function getAccountIdea(userId: string, accountId: string, id: string): Promise<Idea | null> {
  const row = unwrap(
    await db()
      .from('content_ideas')
      .select('id, title, pillar_id, script')
      .eq('id', id)
      .eq('user_id', userId)
      .eq('account_id', accountId)
      .maybeSingle(),
  ) as IdeaRow | null
  return row ? toIdea(row) : null
}

export async function addIdeas(userId: string, accountId: string, ideas: SuggestedIdea[]): Promise<void> {
  unwrap(
    await db()
      .from('content_ideas')
      .insert(ideas.map((idea) => ({
        user_id: userId, account_id: accountId, title: idea.title, pillar_id: idea.pillarId, script: idea.script ?? null,
      }))),
  )
}

/** One idea, for Mimo, which writes its script next. Returns its id. */
export async function addIdea(userId: string, accountId: string, idea: SuggestedIdea): Promise<string> {
  const row = unwrap(
    await db()
      .from('content_ideas')
      .insert({ user_id: userId, account_id: accountId, title: idea.title, pillar_id: idea.pillarId })
      .select('id')
      .single(),
  ) as { id: string }
  return row.id
}

/**
 * An idea with a known id, for Mimo's approved bulk plan: starting the plan again (a retry, a second click) finds the
 * same idea instead of adding another. Callers look for the plan item's job first, so an idea already used up by its
 * post is not made again.
 */
export async function ensureIdea(userId: string, accountId: string, id: string, idea: SuggestedIdea): Promise<void> {
  unwrap(
    await db()
      .from('content_ideas')
      .upsert({ id, user_id: userId, account_id: accountId, title: idea.title, pillar_id: idea.pillarId },
        { onConflict: 'id', ignoreDuplicates: true }),
  )
}

/** Stores the idea's script; false when the idea is gone (used up by a post, or deleted). */
export async function saveIdeaScript(userId: string, id: string, script: ScriptSlide[]): Promise<boolean> {
  const rows = unwrap(
    await db().from('content_ideas').update({ script }).eq('id', id).eq('user_id', userId).select('id'),
  ) as { id: string }[]
  return rows.length > 0
}

/** Account-pinned form for Mimo's long-running new-script request. */
export async function saveAccountIdeaScript(
  userId: string,
  accountId: string,
  id: string,
  script: ScriptSlide[],
): Promise<boolean> {
  const rows = unwrap(
    await db()
      .from('content_ideas')
      .update({ script })
      .eq('id', id)
      .eq('user_id', userId)
      .eq('account_id', accountId)
      .select('id'),
  ) as { id: string }[]
  return rows.length > 0
}

/** Mimo's revision, constrained to the Instagram account whose chat is open. */
export async function reviseAccountIdea(
  userId: string,
  accountId: string,
  id: string,
  title: string,
  script: ScriptSlide[],
): Promise<boolean> {
  const rows = unwrap(
    await db()
      .from('content_ideas')
      .update({ title, script })
      .eq('id', id)
      .eq('user_id', userId)
      .eq('account_id', accountId)
      .select('id'),
  ) as { id: string }[]
  return rows.length > 0
}

export async function deleteIdea(userId: string, id: string): Promise<void> {
  unwrap(await db().from('content_ideas').delete().eq('id', id).eq('user_id', userId))
}

/** Account-pinned cleanup for a Mimo idea whose script failed. */
export async function deleteAccountIdea(userId: string, accountId: string, id: string): Promise<void> {
  unwrap(
    await db().from('content_ideas').delete().eq('id', id).eq('user_id', userId).eq('account_id', accountId),
  )
}

/** What the idea prompt must not repeat: the ideas still open and the newest posts' titles. */
export async function recentTitles(userId: string, accountId: string): Promise<string[]> {
  const [ideas, posts] = await Promise.all([
    listIdeas(userId, accountId),
    db()
      .from('posts')
      .select('title')
      .eq('user_id', userId)
      .eq('account_id', accountId)
      .neq('title', '')
      .order('created_at', { ascending: false })
      .limit(RECENT_POSTS),
  ])
  const titles = (unwrap(posts) as { title: string }[]).map((post) => post.title)
  return [...ideas.map((idea) => idea.title), ...titles]
}
