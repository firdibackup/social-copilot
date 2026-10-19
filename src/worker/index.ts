// Worker: `npm run worker`. Runs apart from Next, locally or on the VPS under pm2/systemd. Two loops in one
// process: publishing scheduled posts, and making AI slides so they don't depend on the owner's browser tab.
import { describeError } from '@/lib/errors'
import { claimDuePost } from '@/lib/posts'
import { processSlide } from '@/lib/slide-generation'
import { claimNextSlide } from '@/lib/slides'
import { processPost } from './publish'

const PUBLISH_IDLE_MS = 30_000
const SLIDE_IDLE_MS = 3_000
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

async function main(): Promise<void> {
  console.log(`[worker] berjalan: publish dicek setiap 30 detik, slide AI ${SLIDE_SLOTS} sekaligus`)
  await Promise.all([publishLoop(), ...Array.from({ length: SLIDE_SLOTS }, slideLoop)])
  console.log('[worker] berhenti')
}

void main()
