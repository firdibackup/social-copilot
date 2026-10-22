import type { Metadata } from 'next'
import Link from 'next/link'
import { connection } from 'next/server'
import { Suspense } from 'react'
import { Notice } from '@/components/notice'
import { getPlan } from '@/lib/app-settings'
import { remainingCredits } from '@/lib/ai'
import { listAssets, listProductGroups } from '@/lib/assets'
import { requireAccount } from '@/lib/auth'
import { getBrandKit, getStrategy } from '@/lib/brand'
import { getConnection } from '@/lib/connection'
import { getDensityDefault } from '@/lib/density'
import { DEFAULT_DENSITY } from '@/lib/density-options'
import { describeError, loadErrorMessage } from '@/lib/errors'
import { parseWibInput, slotOn, suggestedSlot, toSlot } from '@/lib/format'
import { getIdea, listIdeas } from '@/lib/ideas'
import { firstValue, isUuid, type SearchParams } from '@/lib/params'
import { listThreadItems } from '@/lib/post-threads'
import { getPost, listContentPosts } from '@/lib/posts'
import { getScheduleSettings, listTakenTimes } from '@/lib/schedule'
import { MIN_SLOT_LEAD_MS, nextEmptySlots, SLOT_LOOKAHEAD_DAYS } from '@/lib/schedule-slots'
import { listUnfinishedSlides, type SlideRecord } from '@/lib/slides'
import { getThreadsConnection } from '@/lib/threads-connection'
import { ContentEditor } from './content-editor'
import { ContentList } from './content-list'
import type { SlideView } from './post-mockup'
import { StatusNote } from './status-note'

export const metadata: Metadata = { title: 'Buat' }

const OK_MESSAGES: Record<string, string> = {
  draft: 'Draft tersimpan.',
  schedule: 'Post dijadwalkan.',
  now: 'Post masuk antrean dan akan diterbitkan worker dalam 30 detik.',
  cancel: 'Jadwal dibatalkan.',
  retry: 'Post dijadwalkan ulang untuk terbit sekarang.',
  duplicate: 'Salinan dibuat sebagai draft.',
  threads: 'Versi Threads masuk antrean dan akan diterbitkan worker dalam 30 detik.',
  story: 'Story masuk antrean dan akan dibagikan worker dalam 30 detik.',
}

const FAILED_MESSAGES: Record<string, string> = {
  cancel: 'Jadwal tidak bisa dibatalkan karena worker sudah mulai memproses post ini.',
  retry: 'Post ini tidak bisa dicoba lagi pada statusnya sekarang.',
  duplicate: 'Post gagal diduplikat. Coba lagi.',
  hapus: 'Post tidak bisa dihapus saat sedang diterbitkan.',
  threads:
    'Versi Threads belum bisa diterbitkan. Pastikan Threads terhubung di Pengaturan dan isi post Threads-nya tidak kosong atau terlalu panjang.',
  story: 'Story ini tidak bisa dicoba lagi pada statusnya sekarang.',
}

/** The Jadwalkan dialog's next empty slot plus the queue under it. */
const QUEUE_SIZE = 5
const DAY_MS = 24 * 60 * 60 * 1000

interface BuatPageProps {
  searchParams: Promise<SearchParams>
}

export default function BuatPage({ searchParams }: BuatPageProps) {
  return (
    <Suspense fallback={<p className="p-6 text-sm text-ink-muted">Memuat…</p>}>
      <Workspace searchParams={searchParams} />
    </Suspense>
  )
}

const toView = (slide: SlideRecord): SlideView => ({
  id: slide.id,
  position: slide.position,
  format: slide.format,
  status: slide.status === 'ready' ? 'generating' : slide.status,
  error: slide.error,
})

/** A slot picked in Kalender (`?slot=`), while it is still ahead. */
function pickedSlot(value: string | undefined, now: Date) {
  const at = value ? parseWibInput(value) : null
  return at && at.getTime() - now.getTime() >= MIN_SLOT_LEAD_MS ? toSlot(at, now) : null
}

/**
 * Two columns: the post list and ideas, and the editor. `?id=` opens a post, `?ide=` starts a new one from an idea,
 * `?baru=1` starts an empty one, `?tanggal=` (a day picked in Kalender) starts one suggested for that day, and
 * `?slot=` (an empty slot picked in Kalender) one for that slot. `?platform=threads` shows the Threads version. On a
 * phone only one column shows at a time.
 */
async function Workspace({ searchParams }: BuatPageProps) {
  const params = await searchParams
  await connection()
  const { userId, accountId } = await requireAccount()
  const id = firstValue(params.id)
  const ideaParam = firstValue(params.ide)
  const postId = isUuid(id) ? id : null
  const now = new Date()

  let data
  try {
    const [posts, ideas, post, slides, idea, instagram, kit, strategy, products, library, credits, plan] = await Promise.all([
      listContentPosts(userId, accountId),
      listIdeas(userId, accountId),
      postId ? getPost(userId, postId) : null,
      postId ? listUnfinishedSlides(userId, postId) : [],
      !postId && isUuid(ideaParam) ? getIdea(userId, ideaParam) : null,
      getConnection(userId),
      getBrandKit(userId, accountId),
      getStrategy(userId).catch(() => null),
      listProductGroups(userId, accountId),
      listAssets(userId, accountId),
      // Shown as a hint only; every request checks the credits again.
      remainingCredits(userId).then(
        (left) => left.remaining,
        () => null,
      ),
      getPlan(),
    ])
    // Slots and Threads only add to the editor: without them it works as before.
    const [schedule, taken, threads, threadItems, density] = await Promise.all([
      getScheduleSettings(userId, accountId).catch(logAndNull),
      listTakenTimes(userId, accountId, now, new Date(now.getTime() + SLOT_LOOKAHEAD_DAYS * DAY_MS)).catch(() => []),
      getThreadsConnection(userId, accountId).catch(logAndNull),
      postId ? listThreadItems(userId, postId) : [],
      postId ? DEFAULT_DENSITY : getDensityDefault(userId, accountId).catch(() => DEFAULT_DENSITY),
    ])
    data = {
      posts,
      ideas,
      post,
      slides,
      idea,
      instagram,
      kit,
      strategy,
      products,
      library,
      credits,
      plan,
      queue: schedule ? nextEmptySlots(schedule.slots, taken, now, QUEUE_SIZE).map((at) => toSlot(at, now)) : [],
      threads,
      threadItems,
      density,
    }
  } catch (error) {
    console.error('[buat] gagal memuat:', describeError(error))
    return (
      <div className="p-6">
        <Notice tone="warning">{loadErrorMessage(error)}</Notice>
      </div>
    )
  }

  const { posts, ideas, post, slides, idea, instagram, kit, strategy, products, library, credits, plan } = data
  const { queue, threads, threadItems, density } = data
  const platform = firstValue(params.platform) === 'threads' ? 'threads' : 'instagram'
  const day = firstValue(params.tanggal) ?? ''
  const daySlot = day ? slotOn(day, now) : null
  const slotParam = firstValue(params.slot)
  const kalenderSlot = pickedSlot(slotParam, now)
  const editing = Boolean(postId || idea || daySlot || kalenderSlot || firstValue(params.baru))
  const ok = OK_MESSAGES[firstValue(params.ok) ?? '']
  const failed = FAILED_MESSAGES[firstValue(params.gagal) ?? '']
  const instagramReady = instagram?.status === 'active'
  const threadsLink = !threads ? 'none' : threads.status === 'active' ? 'active' : 'needs_reconnect'
  const threadsLocked =
    post?.threads?.status === 'publishing' || post?.threads?.status === 'published' || threadItems.some((item) => item.isSent)

  const notices = (
    <>
      {ok && <Notice tone="success">{ok}</Notice>}
      {failed && <Notice tone="error">{failed}</Notice>}
      {id && !post && (
        <Notice tone="error">
          Post tidak ditemukan. Mungkin sudah dihapus.{' '}
          <Link href="/buat" className="underline">
            Buat konten baru
          </Link>
        </Notice>
      )}
      {post && <StatusNote post={post} />}
      {post?.instagramEnabled && !instagramReady && post.status !== 'published' && (
        <Notice tone="warning">
          Instagram belum tersambung atau perlu disambungkan ulang. Post tetap bisa dijadwalkan, tetapi akan gagal terbit
          sampai akun disambungkan di{' '}
          <Link href="/pengaturan" className="underline">
            Pengaturan
          </Link>
          .
        </Notice>
      )}
      {post?.threads?.enabled && threadsLink !== 'active' && post.threads.status !== 'published' && (
        <Notice tone="warning">
          Threads belum terhubung atau perlu disambungkan ulang, jadi versi Threads akan gagal terbit sampai Threads
          dihubungkan di{' '}
          <Link href="/pengaturan#threads" className="underline">
            Pengaturan
          </Link>
          .
        </Notice>
      )}
    </>
  )

  return (
    <div className="flex h-full min-h-0">
      <ContentList
        posts={posts}
        ideas={ideas}
        selectedId={post?.id ?? null}
        selectedIdeaId={idea?.id ?? null}
        strategy={strategy}
        platform={platform}
        className={editing ? 'hidden md:flex' : 'flex'}
      />
      <section aria-label="Editor" className={`min-h-0 min-w-0 flex-1 flex-col ${editing ? 'flex' : 'hidden md:flex'}`}>
        <ContentEditor
          key={post?.id ?? `baru-${idea?.id ?? ''}-${platform}`}
          post={post}
          slides={slides.map(toView)}
          idea={idea}
          account={{ username: instagram?.username ?? null, avatarUrl: kit.logoUrl }}
          defaultDensity={density}
          products={products.map((product) => ({
            id: product.id,
            label: product.title,
            description: product.description,
            imageCount: product.imageCount,
          }))}
          hasLogo={kit.logoUrl !== null}
          credits={credits}
          planCredits={plan.credits}
          slot={kalenderSlot ?? daySlot ?? queue[0] ?? suggestedSlot(now)}
          queue={queue}
          day={daySlot ? day : null}
          slotParam={kalenderSlot ? (slotParam ?? null) : null}
          library={library}
          notices={notices}
          platform={platform}
          threadsAccount={{ link: threadsLink, username: threads?.username ?? null }}
          threadItems={threadItems.map((item) => ({ text: item.text, media: item.media }))}
          threadsEditable={!threadsLocked && (post === null || ['draft', 'scheduled', 'failed', 'cancelled'].includes(post.status))}
        />
      </section>
    </div>
  )
}

function logAndNull(error: unknown): null {
  console.error('[buat] jadwal atau Threads gagal dimuat:', describeError(error))
  return null
}
