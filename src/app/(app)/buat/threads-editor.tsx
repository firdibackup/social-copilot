'use client'

import { ImagePlus, Plus, Scissors, Trash2, X } from 'lucide-react'
import { useEffect, useEffectEvent, useRef, useState, type KeyboardEvent } from 'react'
import { Avatar } from '@/components/avatar'
import { MediaImage } from '@/components/media-image'
import { Notice } from '@/components/notice'
import type { Asset } from '@/lib/assets'
import {
  itemsFromCaption,
  MAX_THREAD_ITEMS,
  MAX_THREAD_MEDIA,
  splitThreadText,
  threadsLength,
  THREADS_TEXT_LIMIT,
  THREADS_TEXT_WARN,
} from '@/lib/thread-items'
import { PhotoPicker } from './photo-picker'
import { saveThreadItemsAction } from './threads-actions'
import { useSaveBeforeNavigation } from './use-save-before-navigation'
import { useQueryClient } from '@tanstack/react-query'
import { editorKeys, type EditorDetail } from './editor-query'
import { useEditorScope } from './editor-provider'
import { createSaveQueue } from './save-queue'

const AUTOSAVE_MS = 1000
const FAILED = 'Gagal menghubungi server. Coba lagi.'
const ICON_TOOL =
  'inline-flex size-8 items-center justify-center rounded-full text-ink-muted transition-colors hover:bg-zinc-100 hover:text-ink disabled:opacity-40'

export interface ItemMedia {
  assetId: string
  url: string
  width: number
  height: number
}

/** A chain item as the server stored it. */
export interface StoredItem {
  text: string
  media: ItemMedia[]
}

interface EditorItem extends StoredItem {
  key: string
}

interface ThreadsEditorProps {
  /** Null for a new post for Threads only: the first save creates it. */
  postId: string | null
  /** The chain the owner stored; empty while it follows the caption. */
  storedItems: StoredItem[]
  /** The Instagram caption and photos as the editor has them now, which a chain that follows the caption shows. */
  caption: string
  media: ItemMedia[]
  /** Offer to follow the caption again: the post has an Instagram caption to follow. */
  canFollowCaption: boolean
  username: string
  avatarUrl: string | null
  library: Asset[]
  libraryLoading: boolean
  libraryError: string | null
  onLoadLibrary: () => void
  onUploaded: (assets: Asset[]) => void
  editable: boolean
  onCreated: (postId: string) => void
}

let keyCount = 0
const newKey = () => `item-${(keyCount += 1)}`

const toEditorItem = (item: StoredItem): EditorItem => ({ key: newKey(), text: item.text, media: item.media })

/** The caption split as the worker would publish it, every photo on the first item. */
function followCaption(caption: string, media: ItemMedia[]): EditorItem[] {
  const byId = new Map(media.map((photo) => [photo.assetId, photo]))
  return itemsFromCaption(
    caption,
    media.map((photo) => photo.assetId),
  ).map((item, index) => ({
    key: `caption-${index}`,
    text: item.text,
    media: item.assetIds.flatMap((id) => byId.get(id) ?? []),
  }))
}

/**
 * The Threads version of a post as a chain, laid out like the Threads feed: the post, then each reply under it. It
 * follows the Instagram caption until the owner types here; from then on it is saved apart, a second after typing.
 */
export function ThreadsEditor(props: ThreadsEditorProps) {
  const client = useQueryClient()
  const scope = useEditorScope()
  const { postId, storedItems, caption, media, canFollowCaption, username, avatarUrl, library, onUploaded, editable, onCreated } =
    props
  const [own, setOwn] = useState<EditorItem[] | null>(() =>
    storedItems.length > 0 ? storedItems.map(toEditorItem) : postId === null ? [{ key: newKey(), text: '', media: [] }] : null,
  )
  const [version, setVersion] = useState(0)
  const [savedVersion, setSavedVersion] = useState(0)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pickerIndex, setPickerIndex] = useState(0)
  const pickerRef = useRef<HTMLDialogElement>(null)
  const fields = useRef(new Map<string, HTMLTextAreaElement>())
  const focusKey = useRef<string | null>(null)

  const items = own ?? followCaption(caption, media)
  const following = own === null
  const unsaved = version !== savedVersion
  const hasContent = items.some((item) => item.text.trim() !== '' || item.media.length > 0)
  const storedKey = JSON.stringify(storedItems)
  const [seenStored, setSeenStored] = useState(storedKey)
  if (storedKey !== seenStored) {
    setSeenStored(storedKey)
    if (!unsaved) setOwn(storedItems.length ? storedItems.map(toEditorItem) : null)
  }
  const createdId = useRef<string | null>(null)
  const [enqueueSave] = useState(createSaveQueue)

  // A new item gets the cursor once it is on the page.
  useEffect(() => {
    const key = focusKey.current
    if (!key) return
    focusKey.current = null
    fields.current.get(key)?.focus()
  })

  function change(next: EditorItem[]) {
    setOwn(next)
    setVersion((value) => value + 1)
    setError(null)
  }

  const persist = (upTo: number, next: EditorItem[] | null) => enqueueSave(upTo, () => saveSnapshot(upTo, next))
  async function saveSnapshot(upTo: number, next: EditorItem[] | null) {
    setSaving(true)
    const result = await saveThreadItemsAction({
      postId: postId ?? createdId.current,
      items: (next ?? []).map((item) => ({ text: item.text, assetIds: item.media.map((photo) => photo.assetId) })),
    }).catch(() => ({ error: FAILED }))
    setSaving(false)
    if ('error' in result) {
      setError(result.error)
      return false
    }
    setSavedVersion((saved) => Math.max(saved, upTo))
    createdId.current = result.postId
    await client.cancelQueries({ queryKey: editorKeys.detail(scope, result.postId) })
    client.setQueryData<EditorDetail>(editorKeys.detail(scope, result.postId), (current) => current ? {
      ...current, threadItems: (next ?? []).map((item) => ({ text: item.text, media: item.media, isSent: false })),
    } : current)
    if (postId === null) onCreated(result.postId)
    return true
  }

  const autosave = useEffectEvent((upTo: number) => {
    // A new post is created only once it has something in it.
    if (upTo > savedVersion && (postId !== null || hasContent)) void persist(upTo, own)
  })
  useSaveBeforeNavigation(() => unsaved && (postId !== null || hasContent) ? persist(version, own) : Promise.resolve(true))
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

  const update = (index: number, patch: Partial<StoredItem>) =>
    change(items.map((item, at) => (at === index ? { ...item, ...patch } : item)))

  function addAfter(index: number) {
    if (items.length >= MAX_THREAD_ITEMS) {
      setError(`Maksimal ${MAX_THREAD_ITEMS} post dalam satu rantai Threads.`)
      return
    }
    const item = { key: newKey(), text: '', media: [] }
    focusKey.current = item.key
    change([...items.slice(0, index + 1), item, ...items.slice(index + 1)])
  }

  function split(index: number) {
    const parts = splitThreadText(items[index].text)
    if (items.length - 1 + parts.length > MAX_THREAD_ITEMS) {
      setError(`Teks ini jadi ${parts.length} post, lebih dari ${MAX_THREAD_ITEMS} post dalam satu rantai. Pendekkan dulu.`)
      return
    }
    const pieces = parts.map((text, at) => ({ key: newKey(), text, media: at === 0 ? items[index].media : [] }))
    change([...items.slice(0, index), ...pieces, ...items.slice(index + 1)])
  }

  function togglePhoto(asset: Asset) {
    const item = items[pickerIndex]
    if (!item) return
    if (item.media.some((photo) => photo.assetId === asset.id)) {
      update(pickerIndex, { media: item.media.filter((photo) => photo.assetId !== asset.id) })
    } else if (item.media.length < MAX_THREAD_MEDIA) {
      update(pickerIndex, {
        media: [...item.media, { assetId: asset.id, url: asset.url, width: asset.width, height: asset.height }],
      })
    }
  }

  async function followAgain() {
    if (!window.confirm('Ikuti caption Instagram lagi? Perubahan di versi Threads akan hilang.')) return
    const nextVersion = version + 1
    setVersion(nextVersion)
    setOwn(null)
    await persist(nextVersion, null)
  }

  function onKeyDown(event: KeyboardEvent<HTMLTextAreaElement>, index: number) {
    if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
      event.preventDefault()
      addAfter(index)
    }
  }

  return (
    <div className="mx-auto w-full max-w-[520px] space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-ink-muted">
        {following ? (
          <span>Mengikuti caption Instagram. Tulis di sini untuk versi Threads sendiri.</span>
        ) : (
          <span className="flex items-center gap-2">
            Versi Threads sendiri.
            {canFollowCaption && editable && (
              <button type="button" onClick={() => void followAgain()} className="font-medium text-ink underline">
                Ikuti caption lagi
              </button>
            )}
          </span>
        )}
        {!following && !error && (
          <span role="status">{saving ? 'Menyimpan…' : unsaved ? 'Belum tersimpan' : postId ? 'Tersimpan' : ''}</span>
        )}
      </div>
      {error && <Notice tone="error">{error}</Notice>}

      <article aria-label="Pratinjau Threads" className="rounded-2xl border border-hairline bg-white px-4 pt-4">
        <ol>
          {items.map((item, index) => {
            const length = threadsLength(item.text)
            return (
              <li key={item.key} className="flex gap-3">
                <div className="flex flex-col items-center">
                  <Avatar src={avatarUrl} name={username} className="size-9" />
                  {index < items.length - 1 && <span aria-hidden="true" className="mt-1 w-0.5 flex-1 rounded-full bg-zinc-200" />}
                </div>
                <div className="min-w-0 flex-1 pb-5">
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate text-sm font-semibold text-ink">{username}</span>
                    <span className="text-xs text-ink-soft tabular-nums">#{index + 1}</span>
                  </div>
                  <textarea
                    ref={(element) => {
                      if (element) fields.current.set(item.key, element)
                      else fields.current.delete(item.key)
                    }}
                    value={item.text}
                    onChange={(event) => update(index, { text: event.target.value })}
                    onKeyDown={(event) => onKeyDown(event, index)}
                    readOnly={!editable}
                    aria-label={`Teks post Threads #${index + 1}`}
                    placeholder={editable ? (index === 0 ? 'Mulai thread…' : 'Lanjutkan thread…') : ''}
                    className="mt-0.5 block w-full resize-none border-0 bg-transparent p-0 text-[14px] leading-relaxed text-ink [field-sizing:content] placeholder:text-ink-soft read-only:text-ink-muted focus:outline-none"
                  />
                  {item.media.length > 0 && (
                    <ul className="mt-2 flex gap-2 overflow-x-auto pb-1">
                      {item.media.map((photo) => (
                        <li key={photo.assetId} className="relative shrink-0">
                          <MediaImage src={photo.url} className="h-40 w-auto max-w-[220px] rounded-lg bg-zinc-100 object-cover" />
                          {editable && (
                            <button
                              type="button"
                              aria-label="Buang foto ini dari versi Threads"
                              onClick={() => update(index, { media: item.media.filter((other) => other.assetId !== photo.assetId) })}
                              className="absolute top-1.5 right-1.5 flex size-6 items-center justify-center rounded-full bg-black/60 text-white hover:bg-black/80"
                            >
                              <X size={14} aria-hidden="true" />
                            </button>
                          )}
                        </li>
                      ))}
                    </ul>
                  )}
                  {editable && (
                    <div className="mt-1.5 flex flex-wrap items-center gap-0.5">
                      <CharacterRing length={length} />
                      {length > THREADS_TEXT_LIMIT && (
                        <button
                          type="button"
                          onClick={() => split(index)}
                          className="inline-flex h-8 items-center gap-1 rounded-full px-2.5 text-xs font-medium text-accent transition-colors hover:bg-accent-soft"
                        >
                          <Scissors size={14} aria-hidden="true" />
                          Pecah otomatis
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => addAfter(index)}
                        disabled={items.length >= MAX_THREAD_ITEMS}
                        aria-label="Tambah post di bawah"
                        title="Tambah post di bawah (⌘↵)"
                        className={ICON_TOOL}
                      >
                        <Plus size={16} aria-hidden="true" />
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setPickerIndex(index)
                          pickerRef.current?.showModal()
                          props.onLoadLibrary()
                        }}
                        aria-label="Tambah gambar"
                        title="Tambah gambar"
                        className={ICON_TOOL}
                      >
                        <ImagePlus size={16} aria-hidden="true" />
                      </button>
                      {items.length > 1 && (
                        <button
                          type="button"
                          onClick={() => change(items.filter((_, at) => at !== index))}
                          aria-label={`Hapus post #${index + 1}`}
                          title="Hapus post ini"
                          className={`${ICON_TOOL} hover:text-red-600`}
                        >
                          <Trash2 size={15} aria-hidden="true" />
                        </button>
                      )}
                    </div>
                  )}
                </div>
              </li>
            )
          })}
        </ol>
      </article>

      {editable && items.length < MAX_THREAD_ITEMS && (
        <button
          type="button"
          onClick={() => addAfter(items.length - 1)}
          className="flex h-10 w-full items-center justify-center gap-1.5 rounded-xl border border-dashed border-hairline text-sm font-medium text-ink-muted transition-colors hover:border-accent hover:text-accent"
        >
          <Plus size={16} aria-hidden="true" />
          Tambah post
        </button>
      )}

      <PhotoPicker
        dialogRef={pickerRef}
        library={library}
        loading={props.libraryLoading}
        error={props.libraryError}
        onRetry={props.onLoadLibrary}
        selected={items[pickerIndex]?.media.map((photo) => photo.assetId) ?? []}
        max={MAX_THREAD_MEDIA}
        onToggle={togglePhoto}
        onUploaded={(assets) => {
          onUploaded(assets)
          const item = items[pickerIndex]
          if (!item) return
          const room = Math.max(MAX_THREAD_MEDIA - item.media.length, 0)
          update(pickerIndex, {
            media: [
              ...item.media,
              ...assets.slice(0, room).map((asset) => ({
                assetId: asset.id,
                url: asset.url,
                width: asset.width,
                height: asset.height,
              })),
            ],
          })
        }}
        onDone={() => {}}
      />
    </div>
  )
}

const RING_RADIUS = 8
const RING_LENGTH = 2 * Math.PI * RING_RADIUS

/** How full the item is, as Threads counts it: amber near the limit, red past it. */
function CharacterRing({ length }: { length: number }) {
  const tone = length > THREADS_TEXT_LIMIT ? 'text-red-600' : length > THREADS_TEXT_WARN ? 'text-amber-500' : 'text-accent'
  const label = `${length} dari ${THREADS_TEXT_LIMIT} karakter`
  return (
    <span title={label} className="inline-flex h-8 items-center gap-1 px-1.5">
      <svg width="20" height="20" viewBox="0 0 20 20" aria-hidden="true" className={tone}>
        <circle cx="10" cy="10" r={RING_RADIUS} fill="none" stroke="currentColor" strokeOpacity="0.15" strokeWidth="2.5" />
        <circle
          cx="10"
          cy="10"
          r={RING_RADIUS}
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeDasharray={RING_LENGTH}
          strokeDashoffset={RING_LENGTH * (1 - Math.min(length / THREADS_TEXT_LIMIT, 1))}
          transform="rotate(-90 10 10)"
        />
      </svg>
      {length > THREADS_TEXT_WARN && <span className={`text-xs tabular-nums ${tone}`}>{THREADS_TEXT_LIMIT - length}</span>}
      <span className="sr-only">{label}</span>
    </span>
  )
}
