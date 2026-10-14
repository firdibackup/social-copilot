// Publishing worker: `npm run worker`. Runs apart from Next, locally or on the VPS under pm2/systemd.
import { describeError } from '@/lib/errors'
import { claimDuePost } from '@/lib/posts'
import { processPost } from './publish'

const IDLE_MS = 30_000

let stopping = false
let wake: (() => void) | undefined

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    const timer = setTimeout(resolve, ms)
    wake = () => {
      clearTimeout(timer)
      resolve()
    }
  })
}

// Finish the post in hand, then exit. A hard kill mid-publish is still safe: the post is reclaimed
// after 10 minutes and its container checked with Instagram first.
for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => {
    stopping = true
    wake?.()
  })
}

async function main(): Promise<void> {
  console.log('[worker] berjalan, cek jadwal setiap 30 detik')
  while (!stopping) {
    try {
      const post = await claimDuePost()
      if (post) {
        await processPost(post)
        continue
      }
    } catch (error) {
      console.error('[worker] siklus gagal:', describeError(error))
    }
    await sleep(IDLE_MS)
  }
  console.log('[worker] berhenti')
}

void main()
