// Worker: `npm run worker`. Runs apart from Next, locally or on the VPS under pm2/systemd. Loops in one process:
// publishing scheduled posts to Instagram (and their Stories) and to Threads, making AI slides so they don't depend on the owner's
// browser tab, and refreshing Threads tokens once a day.
import { describeError } from '@/lib/errors'
import { claimContentJob } from '@/lib/content-jobs'
import { processContentJob } from '@/lib/content-generation'
import { claimDueStory } from '@/lib/post-stories'
import { claimDueThreads } from '@/lib/post-threads'
import { claimDuePost } from '@/lib/posts'
import { processSlide } from '@/lib/slide-generation'
import { claimNextSlide } from '@/lib/slides'
import { refreshExpiringThreadsTokens } from '@/lib/threads-connection'
import { processPost } from './publish'
import { processStory } from './story-publish'
import { processThreadsPost } from './threads-publish'

const PUBLISH_IDLE_MS = 30_000
const SLIDE_IDLE_MS = 3_000
/** Threads tokens left alone for 60 days can't be refreshed any more; once a day keeps idle ones alive. */
const TOKEN_REFRESH_MS = 24 * 60 * 60 * 1000
/** Slides made at once, across posts; within a post they still go one at a time. */
const SLIDE_SLOTS = 2

let stopping = false
const wakers = new Set<() => void>()

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    const wake = () => {
      clearTimeout(timer)
      wakers.delete(wake)
      resolve()
    }
    const timer = setTimeout(wake, ms)
    wakers.add(wake)
  })
}

// Finish the post and slides in hand, then exit. A hard kill mid-publish is still safe: the post is reclaimed
// after 10 minutes and its container checked with Instagram first; a slide is taken again after 5 minutes.
for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => {
    stopping = true
    for (const wake of [...wakers]) wake()
  })
}

async function publishLoop(): Promise<void> {
  while (!stopping) {
    try {
      const post = await claimDuePost()
      if (post) {
        await processPost(post)
        continue
      }
    } catch (error) {
      console.error('[worker] siklus publish gagal:', describeError(error))
    }
    await sleep(PUBLISH_IDLE_MS)
  }
}

/** Threads goes out on its own loop: an Instagram post and its Threads version publish independently. */
async function threadsLoop(): Promise<void> {
  while (!stopping) {
    try {
      const claimed = await claimDueThreads()
      if (claimed) {
        await processThreadsPost(claimed)
        continue
      }
    } catch (error) {
      console.error('[worker] siklus Threads gagal:', describeError(error))
    }
    await sleep(PUBLISH_IDLE_MS)
  }
}

/** A post's Story goes out after the post, on its own loop, so a slow Story never holds up the next post. */
async function storyLoop(): Promise<void> {
  while (!stopping) {
    try {
      const claimed = await claimDueStory()
      if (claimed) {
        await processStory(claimed)
        continue
      }
    } catch (error) {
      console.error('[worker] siklus Story gagal:', describeError(error))
    }
    await sleep(PUBLISH_IDLE_MS)
  }
}

async function tokenLoop(): Promise<void> {
  while (!stopping) {
    try {
      const refreshed = await refreshExpiringThreadsTokens()
      if (refreshed > 0) console.log(`[worker] ${refreshed} token Threads diperbarui`)
    } catch (error) {
      console.error('[worker] refresh token Threads gagal:', describeError(error))
    }
    await sleep(TOKEN_REFRESH_MS)
  }
}

async function slideLoop(): Promise<void> {
  while (!stopping) {
    try {
      const claimed = await claimNextSlide()
      if (claimed) {
        await processSlide(claimed)
        continue
      }
    } catch (error) {
      console.error('[worker] siklus slide gagal:', describeError(error))
    }
    await sleep(SLIDE_IDLE_MS)
  }
}

async function contentLoop(): Promise<void> {
  while (!stopping) {
    try {
      const job = await claimContentJob()
      if (job) {
        await processContentJob(job)
        continue
      }
    } catch (error) {
      console.error('[worker] siklus draft gagal:', describeError(error))
    }
    await sleep(SLIDE_IDLE_MS)
  }
}

async function main(): Promise<void> {
  console.log(`[worker] berjalan: draft/skrip dicek setiap 3 detik, publish Instagram, Story, dan Threads setiap 30 detik, slide AI ${SLIDE_SLOTS} sekaligus`)
  await Promise.all([contentLoop(), publishLoop(), storyLoop(), threadsLoop(), tokenLoop(), ...Array.from({ length: SLIDE_SLOTS }, slideLoop)])
  console.log('[worker] berhenti')
}

void main()
