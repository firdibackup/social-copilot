'use client'

import Link from 'next/link'
import { useQuery } from '@tanstack/react-query'
import { useSearchParams } from 'next/navigation'
import { LoadingState } from '@/components/loading-state'
import { Notice } from '@/components/notice'
import { DEFAULT_DENSITY } from '@/lib/density-options'
import { parseWibInput, slotOn, suggestedSlot, toSlot } from '@/lib/format'
import { firstValue, isUuid } from '@/lib/params'
import { MIN_SLOT_LEAD_MS } from '@/lib/schedule-slots'
import { ContentEditor } from './content-editor'
import { StatusNote } from './status-note'
import { detailQuery, supportQuery } from './editor-query'
import { useEditorScope } from './editor-provider'

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
export function EditorWorkspace() {
  const params = Object.fromEntries(useSearchParams())
  const scope = useEditorScope()
  const id = firstValue(params.id)
  const ideaParam = firstValue(params.ide)
  const postId = isUuid(id) ? id : null
  const detail = useQuery(detailQuery(scope, postId ?? '', !postId && isUuid(ideaParam) ? ideaParam : ''))
  const support = useQuery(supportQuery(scope))
  if ((!detail.data && detail.error) || (!support.data && support.error)) {
    return <div className="p-6"><Notice tone="error">Konten belum bisa dimuat. <button className="underline" onClick={() => { void detail.refetch(); void support.refetch() }}>Coba lagi</button></Notice></div>
  }
  if (!detail.data || !support.data) return <LoadingState variant="editor" className="h-full" label="Memuat konten…" />
  const data = detail.data
  const { post, slides, idea, threadItems } = data
  const { instagram, kit, products, credits, plan, threads, defaultDensity } = support.data
  const density = data.job?.kind === 'script' ? data.job.payload.density ?? DEFAULT_DENSITY : defaultDensity
  const now = new Date()
  const queue = data.queue.filter((slot) => pickedSlot(slot.value, now))
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
      {(detail.error || support.error) && <Notice tone="warning">Pembaruan belum berhasil. Menampilkan data terakhir. <button className="underline" onClick={() => { void detail.refetch(); void support.refetch() }}>Coba lagi</button></Notice>}
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
      <section aria-label="Editor" className={`min-h-0 min-w-0 flex-1 flex-col ${editing ? 'flex' : 'hidden md:flex'}`}>
        <ContentEditor
          key={`${post?.id ?? `baru-${idea?.id ?? ''}-${platform}`}-${data.job?.kind ?? ''}-${data.job?.kind === 'content' && data.job.status === 'ready' ? 'ready' : ''}`}
          post={data.job?.kind === 'script' ? null : post}
          job={data.job}
          slides={slides}
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
          rates={support.data!.rates}
          slot={kalenderSlot ?? daySlot ?? queue[0] ?? suggestedSlot(now)}
          queue={queue}
          day={daySlot ? day : null}
          slotParam={kalenderSlot ? (slotParam ?? null) : null}
          notices={notices}
          platform={platform}
          threadsAccount={{ link: threadsLink, username: threads?.username ?? null }}
          threadItems={threadItems.map((item) => ({ text: item.text, media: item.media }))}
          threadsEditable={(!data.job || (data.job.kind === 'content' && data.job.status === 'ready')) && !threadsLocked && (post === null || ['draft', 'scheduled', 'failed', 'cancelled'].includes(post.status))}
        />
      </section>
  )
}

