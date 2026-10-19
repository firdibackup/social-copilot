import 'server-only'
import { parseScript, type ScriptSlide } from './script-options'
import { db, unwrap } from './supabase'

// ponytail: the newest 30 ideas and 20 post titles; paginate if the list outgrows them.
const LIST_LIMIT = 30
const RECENT_POSTS = 20

export interface Idea {
  id: string
  title: string
  /** The slide-by-slide script written from the idea, once the owner asked for one. */
  script: ScriptSlide[] | null
}

interface IdeaRow {
  id: string
  title: string
  script: unknown
}

/** A stored script that no longer passes the checks is dropped rather than failing the page. */
const toIdea = (row: IdeaRow): Idea => {
  const parsed = row.script === null ? null : parseScript(row.script)
  return { id: row.id, title: row.title, script: parsed && 'script' in parsed ? parsed.script : null }
}

/** The account's ideas, newest first. */
export async function listIdeas(userId: string, accountId: string): Promise<Idea[]> {
  const rows = unwrap(
    await db()
      .from('content_ideas')
      .select('id, title, script')
      .eq('user_id', userId)
      .eq('account_id', accountId)
      .order('created_at', { ascending: false })
      .limit(LIST_LIMIT),
  ) as IdeaRow[]
  return rows.map(toIdea)
}

export async function getIdea(userId: string, id: string): Promise<Idea | null> {
  const row = unwrap(
    await db().from('content_ideas').select('id, title, script').eq('id', id).eq('user_id', userId).maybeSingle(),
  ) as IdeaRow | null
  return row ? toIdea(row) : null
}

export async function addIdeas(userId: string, titles: string[]): Promise<void> {
  unwrap(await db().from('content_ideas').insert(titles.map((title) => ({ user_id: userId, title }))))
}

/** Stores the idea's script; false when the idea is gone (used up by a post, or deleted). */
export async function saveIdeaScript(userId: string, id: string, script: ScriptSlide[]): Promise<boolean> {
  const rows = unwrap(
    await db().from('content_ideas').update({ script }).eq('id', id).eq('user_id', userId).select('id'),
  ) as { id: string }[]
  return rows.length > 0
}

export async function deleteIdea(userId: string, id: string): Promise<void> {
  unwrap(await db().from('content_ideas').delete().eq('id', id).eq('user_id', userId))
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
