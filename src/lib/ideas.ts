import 'server-only'
import { db, unwrap } from './supabase'

// ponytail: the newest 30 ideas and 20 post titles; paginate if the list outgrows them.
const LIST_LIMIT = 30
const RECENT_POSTS = 20

export interface Idea {
  id: string
  title: string
}

/** The account's ideas, newest first. */
export async function listIdeas(userId: string, accountId: string): Promise<Idea[]> {
  return unwrap(
    await db()
      .from('content_ideas')
      .select('id, title')
      .eq('user_id', userId)
      .eq('account_id', accountId)
      .order('created_at', { ascending: false })
      .limit(LIST_LIMIT),
  ) as Idea[]
}

export async function getIdea(userId: string, id: string): Promise<Idea | null> {
  return unwrap(
    await db().from('content_ideas').select('id, title').eq('id', id).eq('user_id', userId).maybeSingle(),
  ) as Idea | null
}

export async function addIdeas(userId: string, titles: string[]): Promise<void> {
  unwrap(await db().from('content_ideas').insert(titles.map((title) => ({ user_id: userId, title }))))
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
