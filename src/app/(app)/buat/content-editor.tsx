'use client'

import { ArrowLeft } from 'lucide-react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useEffect, useEffectEvent, useRef, useState, type ReactNode } from 'react'
import { InstagramIcon } from '@/components/instagram-icon'
import { Notice, type NoticeTone } from '@/components/notice'
import { PostStatusBadge } from '@/components/post-status-badge'
import type { Asset } from '@/lib/assets'
import { contentCost, formatCreditShare, TASK_CREDITS } from '@/lib/billing-options'
import { CAPTION_MAX_HASHTAGS, CAPTION_MAX_LENGTH, CAPTION_MAX_MENTIONS, inspectCaption } from '@/lib/caption'
import { DEFAULT_SLIDES, MAX_SLIDES, type ReferenceOption } from '@/lib/content-options'
import type { Slot } from '@/lib/format'
import type { Idea } from '@/lib/ideas'
import { IMAGE_FORMATS, isImageFormat, type ImageFormat } from '@/lib/image-options'
import type { Post, PostMedia } from '@/lib/posts'
import { Composer } from './composer'
import {
  createContentAction,
  deleteSlideAction,
  editCaptionAction,
  editSlideAction,
  generateSlideAction,
  saveContentAction,
} from './content-actions'
import { MoreMenu } from './more-menu'
import { PhotoPicker } from './photo-picker'
import { PostMockup, type SlideItem, type SlideView } from './post-mockup'
import { ScheduleButton } from './schedule-button'

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

interface ContentEditorProps {
  post: Post | null
  /** The post's AI slides whose images aren't in it yet. */
  slides: SlideView[]
  /** The idea a new post starts from (`?ide=`). */
  idea: Idea | null
  account: EditorAccount
  references: ReferenceOption[]
  hasLogo: boolean
  /** Credits left in the period; null when they couldn't be read (the server still checks). */
  credits: number | null
  slot: Slot
  /** The day picked in Kalender (`?tanggal=`), kept in the URL while the new post is made. */
  day: string | null
  library: Asset[]
  /** The page's messages about the post, above the toolbar. */
  notices: ReactNode
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
  references,
  hasLogo,
  credits,
  slot,
  day,
  library: initialLibrary,
  notices,
}: ContentEditorProps) {
  const router = useRouter()
  const openPost = (id: string) => router.push(`/buat?id=${id}${day ? `&tanggal=${day}` : ''}`)
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
  const [running, setRunning] = useState<string | null>(null)
  const [version, setVersion] = useState(0)
  const [savedVersion, setSavedVersion] = useState(0)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  // Offered back while the caption is still exactly what the AI put there.
  const [undo, setUndo] = useState<{ before: string; after: string } | null>(null)
  const [slideCount, setSlideCount] = useState(DEFAULT_SLIDES)
  const [format, setFormat] = useState<ImageFormat>('4:5')
  const [referenceId, setReferenceId] = useState('')
  const [includeLogo, setIncludeLogo] = useState(false)
  const pickerRef = useRef<HTMLDialogElement>(null)
  const started = useRef<string | null>(null)

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
  const activeIndex = Math.min(active, Math.max(items.length - 1, 0))
  const current = items[activeIndex]
  const first = media[0]
  const ratio = first ? `${first.width} / ${first.height}` : slides[0]?.format === '1:1' ? '1 / 1' : '4 / 5'
  const inProgress = slides.some((slide) => slide.status === 'pending' || slide.status === 'generating')
  const locked = !editable || inProgress

  // The generation queue runs one slide at a time in carousel order, so every later slide can follow slide 1.
  const head = slides.find((slide) => slide.status !== 'failed')
  const nextId = head && (head.status === 'pending' || head.stale) ? head.id : null
  const waiting = head !== undefined && nextId === null

  async function generate(slideId: string) {
    setRunning(slideId)
    const error = await generateSlideAction(slideId).catch(() => FAILED)
    setRunning(null)
    started.current = null
    if (error) setNotice({ tone: 'error', text: error })
    router.refresh()
  }

  const startNext = useEffectEvent((slideId: string) => void generate(slideId))
  useEffect(() => {
    if (!nextId || started.current === nextId) return
    started.current = nextId
    startNext(nextId)
  }, [nextId])

  // A slide made in another tab, or here before a refresh: look again until it lands.
  useEffect(() => {
    if (!waiting) return
    const timer = setInterval(() => router.refresh(), POLL_MS)
    return () => clearInterval(timer)
  }, [waiting, router])

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

  const short = (cost: number) => credits !== null && cost > credits
  let composer: { placeholder: string; cost: number; blocked: string | null; send: (text: string) => Promise<boolean> }

  if (!post) {
    const cost = contentCost(slideCount)
    composer = {
      placeholder: 'Tulis topik atau ide konten…',
      cost,
      blocked: short(cost) ? SHORT : null,
      send: async (topic) => {
        setNotice(null)
        setBusy('Menyusun caption dan rencana slide…')
        const result = await createContentAction({
          topic,
          slides: slideCount,
          format,
          referenceId: referenceId || null,
          includeLogo,
          ideaId: idea?.id ?? null,
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
              ? 'Tambahkan foto dengan tombol +.'
              : 'Slide ini belum jadi.'
            : short(cost)
              ? SHORT
              : null,
      send: async (instruction) => {
        if (!image) return false
        setNotice(null)
        if (!(await flush())) return false
        setBusy(`Membuat ulang slide ${number}…`)
        setRemaking(true)
        const error = await editSlideAction({ postId: post.id, assetId: image.assetId, instruction }).catch(() => FAILED)
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
      {references.length > 0 && (
        <label className={CHIP}>
          Referensi
          <select value={referenceId} onChange={(event) => setReferenceId(event.target.value)} className={`${CHIP_SELECT} max-w-40`}>
            <option value="">Tanpa</option>
            {references.map((reference) => (
              <option key={reference.id} value={reference.id}>
                {reference.label}
                {reference.slideCount > 1 && ` (${reference.slideCount} slide)`}
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
    </>
  ) : editable ? (
    <div className="flex items-center gap-1 text-xs text-ink-muted">
      Ubah:
      <TargetButton active={target === 'slide'} onClick={() => setTarget('slide')}>
        Slide {activeIndex + 1}
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
            {post && <MoreMenu post={post} />}
            <span className={`inline-flex h-10 items-center gap-2 rounded-xl border border-hairline bg-white px-3 text-sm font-medium text-ink ${TOOL_SHADOW}`}>
              <InstagramIcon className="text-ink" />
              Instagram
            </span>
            {post && <PostStatusBadge status={post.status} />}
            {post && editable && <SaveStatus saving={saving} unsaved={unsaved} error={saveError} />}
            {post && editable && (
              <ScheduleButton
                post={post}
                caption={caption}
                assetIds={media.map((item) => item.assetId)}
                slot={slot}
                disabled={inProgress || busy !== null || items.length === 0}
              />
            )}
          </div>

          <PostMockup
            username={username}
            avatarUrl={account.avatarUrl}
            items={items}
            active={activeIndex}
            onSelect={selectSlide}
            ratio={ratio}
            remaking={remaking}
            running={running}
            editable={!locked && busy === null}
            onRemove={(assetId) => change({ media: media.filter((item) => item.assetId !== assetId) })}
            onMove={movePhoto}
            onRetry={(slideId) => running === null && void generate(slideId)}
            onDropSlide={(slideId) => void dropSlide(slideId)}
            caption={captionArea}
            empty={
              post
                ? 'Post ini belum punya foto. Tambahkan dengan tombol + di bawah.'
                : `Tulis topik di bawah: AI menyusun caption dan ${slideCount} slide sekaligus.`
            }
          />
        </div>
      </div>

      <div className="shrink-0 px-4 pt-2 pb-3 md:px-8 md:pb-4">
        <div className="mx-auto max-w-[680px]">
          <Composer
            placeholder={composer.placeholder}
            cost={`${post ? '' : '≈ '}${formatCreditShare(composer.cost)} kuota`}
            blocked={composer.blocked}
            busyLabel={busy}
            initialText={idea?.title}
            onAttach={!locked && busy === null ? () => pickerRef.current?.showModal() : undefined}
            onSend={composer.send}
          >
            {options}
          </Composer>
        </div>
      </div>

      <PhotoPicker
        dialogRef={pickerRef}
        library={library}
        selected={media.map((item) => item.assetId)}
        max={MAX_MEDIA - slides.length}
        onToggle={togglePhoto}
        onUploaded={addUploaded}
        onDone={() => void pickerDone()}
      />
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
