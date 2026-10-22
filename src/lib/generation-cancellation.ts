import 'server-only'
import { db, unwrap } from './supabase'

export class GenerationCancelled extends Error {
  override name = 'GenerationCancelled'
  constructor() { super('Pembuatan dibatalkan.') }
}

/** Poll the durable lease across web/worker processes; never let an old attempt commit after retry. */
export async function watchGeneration(isActive: () => Promise<boolean>) {
  const controller = new AbortController()
  let stopped = false
  let timer: ReturnType<typeof setTimeout> | undefined
  const check = async () => {
    controller.signal.throwIfAborted()
    if (!(await isActive())) {
      controller.abort(new GenerationCancelled())
      throw controller.signal.reason
    }
    controller.signal.throwIfAborted()
  }
  const poll = async () => {
    try { await check() } catch (error) { controller.abort(error) }
    if (!stopped && !controller.signal.aborted) timer = setTimeout(() => void poll(), 1000)
  }
  await check()
  timer = setTimeout(() => void poll(), 1000)
  return {
    signal: controller.signal,
    check,
    stop: () => { stopped = true; clearTimeout(timer) },
  }
}

export async function contentAttemptActive(postId: string, lease: string): Promise<boolean> {
  return Boolean(unwrap(await db().from('content_jobs').select('post_id')
    .eq('post_id', postId).eq('lease', lease).eq('status', 'running').maybeSingle()))
}

export async function slideAttemptActive(slideId: string, lease: string): Promise<boolean> {
  return Boolean(unwrap(await db().from('post_slides').select('id')
    .eq('id', slideId).eq('lease', lease).eq('status', 'generating').maybeSingle()))
}

export async function editAttemptActive(userId: string, id: string): Promise<boolean> {
  return Boolean(unwrap(await db().from('slide_edit_jobs').select('id')
    .eq('id', id).eq('user_id', userId).eq('status', 'running').maybeSingle()))
}
