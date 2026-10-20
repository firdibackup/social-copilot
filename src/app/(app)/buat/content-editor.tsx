'use client'

import { ArrowLeft, LoaderCircle, RefreshCw, SlidersHorizontal } from 'lucide-react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useEffect, useEffectEvent, useRef, useState, type ReactNode } from 'react'
import { InstagramIcon } from '@/components/instagram-icon'
import { Notice, type NoticeTone } from '@/components/notice'
import { PostStatusBadge } from '@/components/post-status-badge'
import { ThreadsIcon } from '@/components/threads-icon'
import type { Asset } from '@/lib/assets'
import { contentCost, formatCreditShare, TASK_CREDITS } from '@/lib/billing-options'
import { CAPTION_MAX_HASHTAGS, CAPTION_MAX_LENGTH, CAPTION_MAX_MENTIONS, inspectCaption } from '@/lib/caption'
import {
  AUTO_PRODUCT,
  AUTO_REFERENCE,
  DEFAULT_SLIDES,
  MAX_SLIDES,
  type ProductOption,
} from '@/lib/content-options'
import type { Slot } from '@/lib/format'
import type { Idea } from '@/lib/ideas'
import { IMAGE_FORMATS, isImageFormat, type ImageFormat } from '@/lib/image-options'
import type { Post, PostMedia } from '@/lib/posts'
import { scriptHeadline } from '@/lib/script-options'
import type { ContentStrategy } from '@/lib/strategy-options'
import { Composer } from './composer'
import {
  createContentAction,
  deleteSlideAction,
  editCaptionAction,
  editSlideAction,
  retrySlideAction,
  saveContentAction,
} from './content-actions'
import { MoreMenu } from './more-menu'
import { PhotoPicker } from './photo-picker'
import { PlatformDialog, type ThreadsLink } from './platform-dialog'
import { PostMockup, type SlideItem, type SlideView } from './post-mockup'
import { ScheduleButton } from './schedule-button'
import { formatScript, useScriptText } from './script-text'
import { ThreadsEditor, type StoredItem } from './threads-editor'

const MAX_MEDIA = 10
const AUTOSAVE_MS = 1000
const POLL_MS = 4000
const EDITABLE_STATUSES = new Set(['draft', 'scheduled', 'failed', 'cancelled'])
const FAILED = 'Gagal menghubungi server. Coba lagi.'
const LOCKED = 'Post ini tidak bisa diubah lagi.'
const WAIT = 'Tunggu semua slide selesai dibuat.'
const SHORT = 'Kuota AI tidak cukup. Perpanjang di halaman Langganan.'
const CHIP = 'inline-flex items-center gap-1.5 rounded-lg border border-hairline bg-zinc-50 px-2 py-1 text-xs text-ink-muted'
const CHIP_SELECT = 'bg-transparent font-medium text-ink focus:outline-none'
const TOOL_SHADOW = 'shadow-[0_1px_3px_-1px_rgba(0,0,0,0.12)]'

export interface EditorAccount {
  username: string | null
  avatarUrl: string | null
}

/** The tab the editor shows: the Instagram post or its Threads version (`?platform=threads`). */
export type Platform = 'instagram' | 'threads'

interface ContentEditorProps {
  post: Post | null
  /** The post's AI slides whose images aren't in it yet. */
  slides: SlideView[]
  /** The idea a new post starts from (`?ide=`). */
  idea: Idea | null
  account: EditorAccount
  strategy: ContentStrategy | null
  products: ProductOption[]
  hasLogo: boolean
  /** Credits left in the period; null when they couldn't be read (the server still checks). */
  credits: number | null
  /** The plan's credits per period, which costs are shown as a share of. */
  planCredits: number
  slot: Slot
  /** The next empty posting slots for the Jadwalkan dialog, earliest first. */
  queue: Slot[]
  /** The day picked in Kalender (`?tanggal=`), kept in the URL while the new post is made. */
  day: string | null
  /** The slot picked in Kalender (`?slot=`), kept the same way. */
  slotParam: string | null
  library: Asset[]
  /** The page's messages about the post, above the toolbar. */
  notices: ReactNode
  platform: Platform
  /** The Threads account the post would go to. */
  threadsAccount: { link: ThreadsLink; username: string | null }
  /** The post's stored Threads chain; empty while it follows the caption. */
  threadItems: StoredItem[]
  /** The Threads chain can still change: the post is the owner's and nothing of it is on Threads yet. */
  threadsEditable: boolean
}

const toMedia = (asset: Asset, position: number): PostMedia => ({
  assetId: asset.id,
  position,
  url: asset.url,
  width: asset.width,
  height: asset.height,
})

/**
 * Buat's editor. Without a post it is the start of one: a topic in the composer becomes a caption and slides. With
 * a post it shows the feed preview; the composer then edits the active slide or the caption, and everything the
 * owner types is saved by itself.
 */
export function ContentEditor({
  post,
  slides,
  idea,
  account,
  strategy,
  products,
  hasLogo,
  credits,
  planCredits,
  slot,
  queue,
  day,
  slotParam,
  library: initialLibrary,
  notices,
  platform,
  threadsAccount,
  threadItems,
  threadsEditable,
}: ContentEditorProps) {
  const router = useRouter()
  /** A post keeps the day, slot and tab it was opened with. */
  const openPost = (id: string) => {
    const params = new URLSearchParams({ id })
    if (day) params.set('tanggal', day)
    if (slotParam) params.set('slot', slotParam)
    if (platform === 'threads') params.set('platform', 'threads')
    router.push(`/buat?${params}`)
  }
  function showPlatform(next: Platform) {
    const params = new URLSearchParams(window.location.search)
    if (next === 'threads') params.set('platform', 'threads')
    else params.delete('platform')
    router.replace(`/buat?${params}`, { scroll: false })
  }
  const platformRef = useRef<HTMLDialogElement>(null)
  const editable = post === null || (EDITABLE_STATUSES.has(post.status) && !post.isLocked)
  const serverMedia = post?.media ?? []

  const [caption, setCaption] = useState(post?.caption ?? '')
  const [media, setMedia] = useState<PostMedia[]>(serverMedia)
  const [library, setLibrary] = useState(initialLibrary)
  const [active, setActive] = useState(0)
  const [target, setTarget] = useState<'slide' | 'caption'>('slide')
  const [notice, setNotice] = useState<{ tone: NoticeTone; text: string } | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [remaking, setRemaking] = useState(false)
  const [retrying, setRetrying] = useState<string | null>(null)
  const [version, setVersion] = useState(0)
  const [savedVersion, setSavedVersion] = useState(0)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  // Offered back while the caption is still exactly what the AI put there.
  const [undo, setUndo] = useState<{ before: string; after: string } | null>(null)
  const [slideCount, setSlideCount] = useState(DEFAULT_SLIDES)
  const [format, setFormat] = useState<ImageFormat>('4:5')
  const [productGroupId, setProductGroupId] = useState(AUTO_PRODUCT)
  const [pillarId, setPillarId] = useState(idea?.pillarId ?? '')
  const [includeLogo, setIncludeLogo] = useState(false)
  const pickerRef = useRef<HTMLDialogElement>(null)
  const short = (cost: number) => credits !== null && cost > credits
  const draft = useScriptText(post ? null : idea, !short(TASK_CREDITS.content_script), (text) =>
    setNotice({ tone: 'error', text: `Skrip gagal disusun: ${text} Anda tetap bisa kirim idenya sebagai topik.` }),
  )
  const read = post ? null : draft.read
  const script = read && 'script' in read ? read : null
  const scriptError = read && 'error' in read ? read.error : null
  const newSlides = script?.script.length ?? slideCount

  const unsaved = version !== savedVersion

  // A refresh brings what the server has now (a finished slide, an edited one). Typing not saved yet wins.
  const serverKey = `${serverMedia.map((item) => item.assetId).join(',')}|${post?.caption ?? ''}`
  const [seenKey, setSeenKey] = useState(serverKey)
  if (serverKey !== seenKey) {
    setSeenKey(serverKey)
    if (!unsaved) {
      setMedia(serverMedia)
      setCaption(post?.caption ?? '')
    }
  }

  const items: SlideItem[] = [
    ...media.map((item): SlideItem => ({ kind: 'image', key: item.assetId, media: item })),
    ...slides.map((slide): SlideItem => ({ kind: 'slide', key: slide.id, slide })),
  ]
  const inProgress = slides.some((slide) => slide.status === 'pending' || slide.status === 'generating')
  const locked = !editable || inProgress
  // While photos can be added, the add card follows the last slide. A new post gets it once it has photos, so a
  // picker closed without Selesai can be opened again.
  const canAdd = (post !== null || media.length > 0) && !locked && busy === null && items.length < MAX_MEDIA
  const activeIndex = Math.min(active, Math.max(canAdd ? items.length : items.length - 1, 0))
  const current = items[activeIndex]
  const first = media[0]
  const ratio = first ? `${first.width} / ${first.height}` : slides[0]?.format === '1:1' ? '1 / 1' : '4 / 5'
  const openPicker = () => pickerRef.current?.showModal()

  // The worker makes the slides, one at a time per post in carousel order: look again until they land.
  useEffect(() => {
    if (!inProgress) return
    const timer = setInterval(() => router.refresh(), POLL_MS)
    return () => clearInterval(timer)
  }, [inProgress, router])

  async function retry(slideId: string) {
    setRetrying(slideId)
    const error = await retrySlideAction(slideId).catch(() => FAILED)
    setRetrying(null)
    if (error) setNotice({ tone: 'error', text: error })
  }

  async function persist(upTo: number): Promise<boolean> {
    if (!post) return true
    setSaving(true)
    const result = await saveContentAction({
      postId: post.id,
      caption,
      assetIds: media.map((item) => item.assetId),
    }).catch(() => ({ error: FAILED }))
    setSaving(false)
    if ('error' in result) {
      setSaveError(result.error)
      return false
    }
    setSaveError(null)
    setSavedVersion((saved) => Math.max(saved, upTo))
    return true
  }

  const autosave = useEffectEvent((upTo: number) => {
    if (upTo > savedVersion) void persist(upTo)
  })
  useEffect(() => {
    if (version === 0) return
    const timer = setTimeout(() => autosave(version), AUTOSAVE_MS)
    return () => clearTimeout(timer)
  }, [version])

  useEffect(() => {
    if (!unsaved) return
    const warn = (event: BeforeUnloadEvent) => event.preventDefault()
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [unsaved])

  /** Saves now what is still waiting for the autosave, before a request that reads the post. */
  const flush = () => (unsaved ? persist(version) : Promise.resolve(true))

  function change(next: { caption?: string; media?: PostMedia[] }) {
    if (next.caption !== undefined) setCaption(next.caption)
    if (next.media) setMedia(next.media)
    if (post) setVersion((value) => value + 1)
  }

  function selectSlide(index: number) {
    setActive(index)
    setTarget('slide')
  }

  function movePhoto(index: number, offset: -1 | 1) {
    const next = [...media]
    ;[next[index], next[index + offset]] = [next[index + offset], next[index]]
    change({ media: next })
    setActive(index + offset)
  }

  function togglePhoto(asset: Asset) {
    if (media.some((item) => item.assetId === asset.id)) {
      change({ media: media.filter((item) => item.assetId !== asset.id) })
    } else if (media.length + slides.length < MAX_MEDIA) {
      change({ media: [...media, toMedia(asset, media.length)] })
    }
  }

  function addUploaded(assets: Asset[]) {
    setLibrary((current) => [...assets, ...current])
    const room = Math.max(0, MAX_MEDIA - media.length - slides.length)
    change({ media: [...media, ...assets.slice(0, room).map((asset, index) => toMedia(asset, media.length + index))] })
  }

  /** Photos picked without a post yet become a new draft. */
  async function pickerDone() {
    if (post || media.length === 0) return
    setBusy('Menyimpan draft…')
    const result = await saveContentAction({ postId: null, caption: '', assetIds: media.map((item) => item.assetId) }).catch(
      () => ({ error: FAILED }),
    )
    if ('error' in result) {
      setBusy(null)
      setNotice({ tone: 'error', text: result.error })
    } else {
      openPost(result.postId)
    }
  }

  async function dropSlide(slideId: string) {
    const error = await deleteSlideAction(slideId).catch(() => FAILED)
    if (error) setNotice({ tone: 'error', text: error })
  }

  let composer: {
    placeholder: string
    cost: number
    blocked: string | null
    send: (text: string, attachment: string | null) => Promise<boolean>
  }

  if (!post) {
    const cost = contentCost(newSlides)
    composer = {
      placeholder: 'Tulis topik atau ide konten…',
      cost,
      blocked: scriptError ?? (short(cost) ? SHORT : null),
      send: async (text, attachment) => {
        setNotice(null)
        setBusy(script ? 'Menyusun caption dan visual dari skrip…' : 'Menyusun caption dan rencana slide…')
        // The slides follow the account's references, or the design style's examples when it has none; a specific
        // design or footage comes as an attached image. A script keeps each slide's text as written.
        const topic = script
          ? [idea?.title, script.intro].filter(Boolean).join('\n\n') || scriptHeadline(script.script[0])
          : text
        const result = await createContentAction({
          topic,
          slides: newSlides,
          format,
          referenceId: AUTO_REFERENCE,
          productGroupId: products.length > 0 ? productGroupId || null : null,
          pillarId: pillarId || null,
          includeLogo,
          ideaId: idea?.id ?? null,
          script: script?.script ?? null,
          attachment,
        }).catch(() => ({ error: FAILED }))
        if ('error' in result) {
          setBusy(null)
          setNotice({ tone: 'error', text: result.error })
          return false
        }
        openPost(result.postId)
        return true
      },
    }
  } else if (target === 'caption') {
    const cost = TASK_CREDITS.caption_edit
    composer = {
      placeholder: 'Tulis perubahan untuk caption…',
      cost,
      blocked: !editable ? LOCKED : inProgress ? WAIT : short(cost) ? SHORT : null,
      send: async (instruction) => {
        setNotice(null)
        setBusy('Mengubah caption…')
        const result = await editCaptionAction({ caption, instruction }).catch(() => ({ error: FAILED }))
        setBusy(null)
        if ('error' in result) {
          setNotice({ tone: 'error', text: result.error })
          return false
        }
        setUndo({ before: caption, after: result.caption })
        change({ caption: result.caption })
        return true
      },
    }
  } else {
    const cost = TASK_CREDITS.slide_edit
    const image = current?.kind === 'image' ? current.media : null
    const number = activeIndex + 1
    composer = {
      placeholder: image ? `Tulis perubahan untuk slide ${number}…` : 'Tulis perubahan untuk slide…',
      cost,
      blocked: !editable
        ? LOCKED
        : inProgress
          ? WAIT
          : !image
            ? items.length === 0
              ? 'Tambahkan foto lewat kartu Tambah foto.'
              : current
                ? 'Slide ini belum jadi.'
                : 'Pilih slide yang mau diubah.'
            : short(cost)
              ? SHORT
              : null,
      send: async (instruction, attachment) => {
        if (!image) return false
        setNotice(null)
        if (!(await flush())) return false
        setBusy(`Membuat ulang slide ${number}…`)
        setRemaking(true)
        const error = await editSlideAction({ postId: post.id, assetId: image.assetId, instruction, attachment }).catch(
          () => FAILED,
        )
        setBusy(null)
        setRemaking(false)
        if (error) {
          setNotice({ tone: 'error', text: error })
          return false
        }
        router.refresh()
        return true
      },
    }
  }

  const options = !post ? (
    <>
      {read ? (
        <span className={CHIP} title="Jumlah slide mengikuti baris Slide di skrip">
          Skrip <span className="font-medium text-ink">{script ? `${script.script.length} slide` : 'belum valid'}</span>
        </span>
      ) : (
        <label className={CHIP}>
          Slide
          <select value={slideCount} onChange={(event) => setSlideCount(Number(event.target.value))} className={CHIP_SELECT}>
            {Array.from({ length: MAX_SLIDES }, (_, index) => index + 1).map((count) => (
              <option key={count} value={count}>
                {count}
              </option>
            ))}
          </select>
        </label>
      )}
      <label className={CHIP}>
        Format
        <select
          value={format}
          onChange={(event) => isImageFormat(event.target.value) && setFormat(event.target.value)}
          className={CHIP_SELECT}
        >
          {Object.entries(IMAGE_FORMATS).map(([key, value]) => (
            <option key={key} value={key}>
              {value.label}
            </option>
          ))}
        </select>
      </label>
      {products.length > 0 && (
        <label className={CHIP}>
          Produk
          <select value={productGroupId} onChange={(event) => setProductGroupId(event.target.value)} className={`${CHIP_SELECT} max-w-40`}>
            <option value={AUTO_PRODUCT}>Otomatis</option>
            <option value="">Tanpa</option>
            {products.map((product) => (
              <option key={product.id} value={product.id}>
                {product.label} ({product.imageCount})
              </option>
            ))}
          </select>
        </label>
      )}
      {strategy && strategy.pillars.length > 0 && (
        <label className={CHIP}>
          Pilar:
          <select value={pillarId} onChange={(event) => setPillarId(event.target.value)} className={`${CHIP_SELECT} max-w-40`}>
            <option value="">Otomatis</option>
            {strategy.pillars.map((pillar) => (
              <option key={pillar.id} value={pillar.id}>
                {pillar.name}
              </option>
            ))}
          </select>
        </label>
      )}
      {hasLogo && (
        <label className={CHIP}>
          <input type="checkbox" checked={includeLogo} onChange={(event) => setIncludeLogo(event.target.checked)} className="accent-accent" />
          Logo
        </label>
      )}
      {idea && (
        <span className="ml-auto flex items-center gap-2">
          {(draft.saveError ?? draft.saveState) && (
            <span role={draft.saveError ? 'alert' : 'status'} className={`text-xs ${draft.saveError ? 'text-red-700' : 'text-ink-soft'}`}>
              {draft.saveError ?? draft.saveState}
            </span>
          )}
          <button
            type="button"
            onClick={() => {
              if (!read || window.confirm('Susun ulang skrip? Teks di kotak, termasuk perubahan Anda, akan diganti.')) void draft.write()
            }}
            disabled={draft.writing || busy !== null || short(TASK_CREDITS.content_script)}
            title={
              short(TASK_CREDITS.content_script)
                ? SHORT
                : `AI menulis skrip slide demi slide dari ide ini (≈ ${formatCreditShare(TASK_CREDITS.content_script, planCredits)} kuota)`
            }
            className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-medium text-accent transition-colors hover:bg-accent-soft disabled:text-ink-soft disabled:hover:bg-transparent"
          >
            {draft.writing ? <LoaderCircle size={14} className="animate-spin" aria-hidden="true" /> : <RefreshCw size={14} aria-hidden="true" />}
            {read ? 'Susun ulang' : 'Susun skrip'}
          </button>
        </span>
      )}
    </>
  ) : editable ? (
    <div className="flex items-center gap-1 text-xs text-ink-muted">
      Ubah:
      <TargetButton active={target === 'slide'} onClick={() => setTarget('slide')}>
        {current ? `Slide ${activeIndex + 1}` : 'Slide'}
      </TargetButton>
      <TargetButton active={target === 'caption'} onClick={() => setTarget('caption')}>
        Caption
      </TargetButton>
    </div>
  ) : null

  const counts = inspectCaption(caption)
  const username = account.username ?? 'akun_anda'
  // Not while an AI request runs: actions run one at a time, so an autosave typed during a slide edit would run
  // after it with the old photo list and drop the new image.
  const captionLocked = locked || busy !== null
  const captionArea = post ? (
    <div className="space-y-1">
      <p className="text-[13px] font-semibold text-ink">{username}</p>
      <textarea
        value={caption}
        onChange={(event) => change({ caption: event.target.value })}
        onFocus={() => setTarget('caption')}
        readOnly={captionLocked}
        aria-label="Caption"
        placeholder={captionLocked ? '' : 'Tulis caption, atau minta AI lewat kotak di bawah…'}
        className="block w-full resize-none border-0 bg-transparent p-0 text-[13px] leading-relaxed text-ink [field-sizing:content] placeholder:text-ink-soft read-only:text-ink-muted focus:outline-none"
      />
      <p className="flex flex-wrap gap-x-3 text-[11px] text-ink-muted">
        <Count value={counts.length} max={CAPTION_MAX_LENGTH} label="karakter" />
        <Count value={counts.hashtags} max={CAPTION_MAX_HASHTAGS} label="hashtag" />
        <Count value={counts.mentions} max={CAPTION_MAX_MENTIONS} label="mention" />
      </p>
      {undo && caption === undo.after && !captionLocked && (
        <p className="text-xs text-ink-muted">
          Caption diganti AI.{' '}
          <button
            type="button"
            onClick={() => {
              change({ caption: undo.before })
              setUndo(null)
            }}
            className="font-medium text-ink underline"
          >
            Urungkan
          </button>
        </p>
      )}
    </div>
  ) : (
    <p className="text-[13px] text-ink-muted">Caption muncul di sini.</p>
  )

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="min-h-0 flex-1 overflow-y-auto px-4 pt-3 md:px-8">
        <div className="mx-auto flex max-w-[680px] flex-col gap-4 pb-6">
          <Link href="/buat" className="inline-flex items-center gap-1 text-sm text-ink-muted md:hidden">
            <ArrowLeft size={16} aria-hidden="true" />
            Semua konten
          </Link>
          {notices}
          {notice && <Notice tone={notice.tone}>{notice.text}</Notice>}

          <div className="flex flex-wrap items-center gap-2">
            {post && <MoreMenu post={post} onPlatforms={() => platformRef.current?.showModal()} />}
            <PlatformTabs
              platform={platform}
              onSelect={showPlatform}
              instagramOn={post ? post.instagramEnabled : null}
              threadsOn={post ? Boolean(post.threads?.enabled) : null}
            />
            {post && (
              <button
                type="button"
                onClick={() => platformRef.current?.showModal()}
                aria-label="Pilih platform"
                title="Pilih platform"
                className={`flex size-10 items-center justify-center rounded-xl border border-hairline bg-white text-ink transition-transform hover:scale-105 ${TOOL_SHADOW}`}
              >
                <SlidersHorizontal size={17} aria-hidden="true" />
              </button>
            )}
            {post && <PostStatusBadge status={post.status} />}
            {post && editable && <SaveStatus saving={saving} unsaved={unsaved} error={saveError} />}
            {post && editable && (
              <ScheduleButton
                post={post}
                caption={caption}
                assetIds={media.map((item) => item.assetId)}
                slot={slot}
                queue={queue}
                disabled={inProgress || busy !== null || (post.instagramEnabled && items.length === 0)}
              />
            )}
          </div>

          {platform === 'threads' ? (
            <>
              {post && !post.threads?.enabled && (
                <Notice tone="warning">
                  Threads belum aktif untuk post ini, jadi versi ini belum ikut terbit.{' '}
                  <button type="button" onClick={() => platformRef.current?.showModal()} className="font-medium underline">
                    Pilih platform
                  </button>
                </Notice>
              )}
              <ThreadsEditor
                postId={post?.id ?? null}
                storedItems={threadItems}
                caption={caption}
                media={media}
                canFollowCaption={post !== null && post.instagramEnabled}
                username={threadsAccount.username ?? username}
                avatarUrl={account.avatarUrl}
                library={library}
                onUploaded={(assets) => setLibrary((current) => [...assets, ...current])}
                editable={threadsEditable}
                onCreated={openPost}
              />
            </>
          ) : (
          <PostMockup
            username={username}
            avatarUrl={account.avatarUrl}
            items={items}
            active={activeIndex}
            onSelect={selectSlide}
            ratio={ratio}
            remaking={remaking}
            running={retrying}
            editable={!locked && busy === null}
            onRemove={(assetId) => {
              const next = media.filter((item) => item.assetId !== assetId)
              change({ media: next })
              // Stay on a slide rather than land on the add card when the last photo goes.
              setActive((index) => Math.min(index, Math.max(next.length + slides.length - 1, 0)))
            }}
            onMove={movePhoto}
            onRetry={(slideId) => retrying === null && void retry(slideId)}
            onDropSlide={(slideId) => void dropSlide(slideId)}
            caption={captionArea}
            onAdd={canAdd ? openPicker : undefined}
            maxSlides={MAX_MEDIA}
            empty={
              post ? (
                'Post ini belum punya foto.'
              ) : (
                <span className="flex flex-col items-center gap-3">
                  {draft.writing
                    ? 'AI sedang menyusun skrip dari ide ini di kotak bawah…'
                    : script
                      ? `Ubah skrip di kotak bawah bila perlu, lalu kirim: AI membuat caption dan ${script.script.length} slide persis dari teksnya.`
                      : `Tulis topik di bawah: AI menyusun caption dan ${slideCount} slide sekaligus.`}
                  {busy === null && (
                    <button
                      type="button"
                      onClick={openPicker}
                      className="rounded-lg border border-hairline bg-white px-3 py-1.5 text-sm font-medium text-ink transition-colors hover:bg-zinc-50"
                    >
                      Pakai foto sendiri
                    </button>
                  )}
                </span>
              )
            }
          />
          )}
        </div>
      </div>

      {/* The AI box edits the Instagram slides and caption; the Threads tab is edited in place. */}
      {platform !== 'threads' && (
      <div className="shrink-0 px-4 pt-2 pb-3 md:px-8 md:pb-4">
        <div className="mx-auto max-w-[680px]">
          <Composer
            placeholder={composer.placeholder}
            cost={`${post ? '' : '≈ '}${formatCreditShare(composer.cost, planCredits)} kuota`}
            blocked={composer.blocked}
            busyLabel={busy ?? (draft.writing ? 'Menyusun skrip dari ide…' : null)}
            text={post ? undefined : draft.text}
            onTextChange={post ? undefined : draft.setText}
            readOnly={draft.writing}
            format={post ? undefined : formatScript}
            canAttach={!post || target === 'slide'}
            onSend={composer.send}
          >
            {options}
          </Composer>
        </div>
      </div>
      )}

      <PhotoPicker
        dialogRef={pickerRef}
        library={library}
        selected={media.map((item) => item.assetId)}
        max={MAX_MEDIA - slides.length}
        onToggle={togglePhoto}
        onUploaded={addUploaded}
        onDone={() => void pickerDone()}
      />

      {post && (
        <PlatformDialog
          key={`${post.instagramEnabled}-${Boolean(post.threads?.enabled)}-${Boolean(post.story?.enabled)}`}
          dialogRef={platformRef}
          postId={post.id}
          instagram={{
            enabled: post.instagramEnabled,
            username: account.username,
            locked: post.isLocked || !EDITABLE_STATUSES.has(post.status),
          }}
          threads={{
            enabled: Boolean(post.threads?.enabled),
            username: threadsAccount.username,
            link: threadsAccount.link,
            locked: post.threads?.status === 'publishing' || post.threads?.status === 'published',
          }}
          story={{
            enabled: Boolean(post.story?.enabled),
            locked:
              post.isLocked ||
              post.status === 'publishing' ||
              post.status === 'published' ||
              post.story?.status === 'publishing' ||
              post.story?.status === 'published',
          }}
        />
      )}
    </div>
  )
}

interface PlatformTabsProps {
  platform: Platform
  onSelect: (platform: Platform) => void
  /** Whether the post goes there; null for a new post. */
  instagramOn: boolean | null
  threadsOn: boolean | null
}

/** Which version the editor shows. A dot marks the platforms the post goes to. */
function PlatformTabs({ platform, onSelect, instagramOn, threadsOn }: PlatformTabsProps) {
  const tabs = [
    { key: 'instagram' as const, label: 'Instagram', icon: <InstagramIcon width={18} height={18} />, on: instagramOn },
    { key: 'threads' as const, label: 'Threads', icon: <ThreadsIcon size={18} />, on: threadsOn },
  ]
  return (
    <div role="tablist" aria-label="Platform" className={`inline-flex h-10 items-center gap-0.5 rounded-xl border border-hairline bg-white p-1 ${TOOL_SHADOW}`}>
      {tabs.map((tab) => (
        <button
          key={tab.key}
          type="button"
          role="tab"
          aria-selected={platform === tab.key}
          onClick={() => onSelect(tab.key)}
          title={tab.on === false ? `${tab.label}: belum ikut diposting` : tab.label}
          className={`relative inline-flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-sm font-medium transition-colors ${platform === tab.key ? 'bg-zinc-100 text-ink' : 'text-ink-muted hover:text-ink'}`}
        >
          {tab.icon}
          {tab.label}
          {tab.on && <span aria-hidden="true" className="absolute bottom-0.5 left-1/2 size-1 -translate-x-1/2 rounded-full bg-accent" />}
        </button>
      ))}
    </div>
  )
}

function TargetButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={`rounded-md px-2 py-0.5 font-medium transition-colors ${active ? 'bg-accent-soft text-accent' : 'text-ink-muted hover:bg-zinc-100'}`}
    >
      {children}
    </button>
  )
}

function SaveStatus({ saving, unsaved, error }: { saving: boolean; unsaved: boolean; error: string | null }) {
  if (error) {
    return (
      <span role="alert" className="text-xs text-red-700">
        {error}
      </span>
    )
  }
  return (
    <span role="status" className="text-xs text-ink-muted">
      {saving ? 'Menyimpan…' : unsaved ? 'Belum tersimpan' : 'Tersimpan'}
    </span>
  )
}

function Count({ value, max, label }: { value: number; max: number; label: string }) {
  return (
    <span className={value > max ? 'font-medium text-red-600' : undefined}>
      {value.toLocaleString('id-ID')}/{max.toLocaleString('id-ID')} {label}
    </span>
  )
}
