import type { Metadata } from 'next'
import Link from 'next/link'
import { connection } from 'next/server'
import { Suspense } from 'react'
import { Notice } from '@/components/notice'
import { remainingCredits } from '@/lib/ai'
import { listAssets } from '@/lib/assets'
import { requireAccount } from '@/lib/auth'
import { getBrandKit, listReferences } from '@/lib/brand'
import { getConnection } from '@/lib/connection'
import { describeError, loadErrorMessage } from '@/lib/errors'
import { slotOn, suggestedSlot } from '@/lib/format'
import { getIdea, listIdeas } from '@/lib/ideas'
import { firstValue, isUuid, type SearchParams } from '@/lib/params'
import { getPost, listContentPosts } from '@/lib/posts'
import { listUnfinishedSlides, type SlideRecord } from '@/lib/slides'
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
}

const FAILED_MESSAGES: Record<string, string> = {
  cancel: 'Jadwal tidak bisa dibatalkan karena worker sudah mulai memproses post ini.',
  retry: 'Post ini tidak bisa dicoba lagi pada statusnya sekarang.',
  duplicate: 'Post gagal diduplikat. Coba lagi.',
  hapus: 'Post tidak bisa dihapus saat sedang diterbitkan.',
}

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
  stale: slide.stale,
})

/**
 * Two columns: the post list and ideas, and the editor. `?id=` opens a post, `?ide=` starts a new one from an idea,
 * `?baru=1` starts an empty one, and `?tanggal=` (a day picked in Kalender) starts one suggested for that day. On a
 * phone only one column shows at a time.
 */
async function Workspace({ searchParams }: BuatPageProps) {
  const params = await searchParams
  await connection()
  const { userId, accountId } = await requireAccount()
  const id = firstValue(params.id)
  const ideaParam = firstValue(params.ide)
  const postId = isUuid(id) ? id : null

  let data
  try {
    const [posts, ideas, post, slides, idea, instagram, kit, references, library, credits] = await Promise.all([
      listContentPosts(userId, accountId),
      listIdeas(userId, accountId),
      postId ? getPost(userId, postId) : null,
      postId ? listUnfinishedSlides(userId, postId) : [],
      !postId && isUuid(ideaParam) ? getIdea(userId, ideaParam) : null,
      getConnection(userId),
      getBrandKit(userId, accountId),
      listReferences(userId, accountId),
      listAssets(userId, accountId),
      // Shown as a hint only; every request checks the credits again.
      remainingCredits(userId).then(
        (left) => left.remaining,
        () => null,
      ),
    ])
    data = { posts, ideas, post, slides, idea, instagram, kit, references, library, credits }
  } catch (error) {
    console.error('[buat] gagal memuat:', describeError(error))
    return (
      <div className="p-6">
        <Notice tone="warning">{loadErrorMessage(error)}</Notice>
      </div>
    )
  }

  const { posts, ideas, post, slides, idea, instagram, kit, references, library, credits } = data
  const now = new Date()
  const day = firstValue(params.tanggal) ?? ''
  const daySlot = day ? slotOn(day, now) : null
  const editing = Boolean(postId || idea || daySlot || firstValue(params.baru))
  const ok = OK_MESSAGES[firstValue(params.ok) ?? '']
  const failed = FAILED_MESSAGES[firstValue(params.gagal) ?? '']
  const instagramReady = instagram?.status === 'active'

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
      {post && !instagramReady && post.status !== 'published' && (
        <Notice tone="warning">
          Instagram belum tersambung atau perlu disambungkan ulang. Post tetap bisa dijadwalkan, tetapi akan gagal terbit
          sampai akun disambungkan di{' '}
          <Link href="/pengaturan" className="underline">
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
        className={editing ? 'hidden md:flex' : 'flex'}
      />
      <section aria-label="Editor" className={`min-h-0 min-w-0 flex-1 flex-col ${editing ? 'flex' : 'hidden md:flex'}`}>
        <ContentEditor
          key={post?.id ?? `baru-${idea?.id ?? ''}`}
          post={post}
          slides={slides.map(toView)}
          idea={idea}
          account={{ username: instagram?.username ?? null, avatarUrl: kit.logoUrl }}
          references={references.map((reference) => ({
            id: reference.id,
            url: reference.images[0]?.url ?? '',
            label: reference.sourceLabel || 'Referensi',
          }))}
          hasLogo={kit.logoUrl !== null}
          credits={credits}
          slot={daySlot ?? suggestedSlot(now)}
          day={daySlot ? day : null}
          library={library}
          notices={notices}
        />
      </section>
    </div>
  )
}
