'use client'

import type { Locale } from '@/i18n/locale-config'

import { useLocale, useTranslations } from 'next-intl'

import Link from 'next/link'
import { useEffect } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useSearchParams } from 'next/navigation'
import { LoadingState } from '@/components/loading-state'
import { Notice } from '@/components/notice'
import { DEFAULT_DENSITY } from '@/lib/density-options'
import { parseWibInput, slotOn, suggestedSlot, toSlot } from '@/lib/format'
import { firstValue, isUuid } from '@/lib/params'
import { MIN_SLOT_LEAD_MS } from '@/lib/schedule-slots'
import { ContentEditor } from './content-editor'
import { StatusNote } from './status-note'
import { detailQuery, editorKeys, supportQuery, type EditorDetail, type EditorSupport } from './editor-query'
import { useEditorScope } from './editor-provider'
import { useHiddenPosts } from './optimistic-events'





/** What the server rendered for the URL it saw; null parts are fetched by the browser. */
export interface EditorInitial {
  id: string
  idea: string
  at: number
  detail: EditorDetail | null
  support: EditorSupport | null
}

/** A slot picked in Kalender (`?slot=`), while it is still ahead. */
function pickedSlot(value: string | undefined, now: Date, locale: Locale) {
  const at = value ? parseWibInput(value) : null
  return at && at.getTime() - now.getTime() >= MIN_SLOT_LEAD_MS ? toSlot(at, now, locale) : null
}

/**
 * Two columns: the post list and ideas, and the editor. `?id=` opens a post, `?ide=` starts a new one from an idea,
 * `?baru=1` starts an empty one, `?tanggal=` (a day picked in Kalender) starts one suggested for that day, and
 * `?slot=` (an empty slot picked in Kalender) one for that slot. `?platform=threads` shows the Threads version. On a
 * phone only one column shows at a time.
 */
export function EditorWorkspace({ initial }: { initial: EditorInitial }) {
  const t = useTranslations('editor.editorWorkspace')
  const locale = useLocale()

  const FAILED_MESSAGES: Record<string, string> = {
  cancel: t('message1'),
  retry: t('message2'),
  duplicate: t('message3'),
  hapus: t('message4'),
  threads:
    t('message5'),
  story: t('message6'),
}

  const OK_MESSAGES: Record<string, string> = {
  draft: t('message7'),
  schedule: t('message8'),
  now: t('message9'),
  cancel: t('message10'),
  retry: t('message11'),
  duplicate: t('message12'),
  threads: t('message13'),
  story: t('message14'),
}

  const params = Object.fromEntries(useSearchParams())
  const scope = useEditorScope()
  const client = useQueryClient()
  const hidden = useHiddenPosts()
  // A post deleted here is gone at once; the URL follows only after the delete action's re-render.
  const rawId = firstValue(params.id)
  const id = rawId && hidden.has(rawId) ? undefined : rawId
  const ideaParam = firstValue(params.ide)
  const postId = isUuid(id) ? id : null
  const ideaKey = !postId && isUuid(ideaParam) ? ideaParam : ''
  const seeded = initial.id === (postId ?? '') && initial.idea === ideaKey
  const detail = useQuery({ ...detailQuery(scope, postId ?? '', ideaKey, locale), ...(seeded && initial.detail && { initialData: initial.detail, initialDataUpdatedAt: initial.at }) })
  const support = useQuery({ ...supportQuery(scope, locale), ...(initial.support && { initialData: initial.support, initialDataUpdatedAt: initial.at }) })
  // Each server render (a refresh after an action, or the poll) brings fresh data: other drafts go stale, these are taken as-is.
  useEffect(() => {
    const complete = initial.detail && initial.support
    void client.invalidateQueries({ queryKey: editorKeys.all(scope), refetchType: complete ? 'none' : 'active' })
    if (!complete) return
    client.setQueryData(editorKeys.detail(scope, initial.id, initial.idea), initial.detail, { updatedAt: initial.at })
    client.setQueryData(editorKeys.support(scope), initial.support, { updatedAt: initial.at })
  }, [client, scope, initial])
  if ((!detail.data && detail.error) || (!support.data && support.error)) {
    return <div className="p-6"><Notice tone="error">{t('message15')} <button className="underline" onClick={() => { void detail.refetch(); void support.refetch() }}>{t('message16')}</button></Notice></div>
  }
  if (!detail.data || !support.data) return <LoadingState variant="editor" className="h-full" label={t('message17')} />
  const data = detail.data
  const { post, slides, idea, threadItems } = data
  const { instagram, kit, products, references, credits, plan, threads, defaultDensity } = support.data
  const density = data.job?.kind === 'script' ? data.job.payload.density ?? DEFAULT_DENSITY : defaultDensity
  const now = new Date()
  const queue = data.queue.flatMap((slot) => { const picked = pickedSlot(slot.value, now, locale); return picked ? [picked] : [] })
  const platform = firstValue(params.platform) === 'threads' ? 'threads' : 'instagram'
  const day = firstValue(params.tanggal) ?? ''
  const daySlot = day ? slotOn(day, now, locale) : null
  const slotParam = firstValue(params.slot)
  const kalenderSlot = pickedSlot(slotParam, now, locale)
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
      {(detail.error || support.error) && <Notice tone="warning">{t('message18')} <button className="underline" onClick={() => { void detail.refetch(); void support.refetch() }}>{t('message16')}</button></Notice>}
      {id && !post && (
        <Notice tone="error">
           {t('message19')}{' '}
          <Link href="/buat" className="underline">
             {t('message20')} </Link>
        </Notice>
      )}
      {post && <StatusNote post={post} />}
      {post?.instagramEnabled && !instagramReady && post.status !== 'published' && (
        <Notice tone="warning">
           {t('message21')}{' '}
          <Link href="/pengaturan" className="underline">
             {t('message22')} </Link>
          .
        </Notice>
      )}
      {post?.threads?.enabled && threadsLink !== 'active' && post.threads.status !== 'published' && (
        <Notice tone="warning">
           {t('message23')}{' '}
          <Link href="/pengaturan#threads" className="underline">
             {t('message22')} </Link>
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
          references={references}
          hasLogo={kit.logoUrl !== null}
          credits={credits}
          planCredits={plan.credits}
          rates={support.data!.rates}
          slot={kalenderSlot ?? daySlot ?? queue[0] ?? suggestedSlot(now, locale)}
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

