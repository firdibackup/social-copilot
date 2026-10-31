'use client'

import { Check, ChevronLeft, ChevronRight, ExternalLink, Grid2x2, ImagePlus, Search, Sparkles, Trash2 } from 'lucide-react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useEffect, useRef, useState, type FormEvent } from 'react'
import { confirmDialog } from '@/components/confirm-dialog'
import { GridSplitter, type GridSelection, type GridTile } from '@/components/grid-splitter'
import { LoadingState } from '@/components/loading-state'
import { ExternalImage, MediaImage } from '@/components/media-image'
import { Notice } from '@/components/notice'
import {
  DESCRIPTION_MAX_LENGTH,
  MAX_GROUP_IMAGES,
  MAX_REFERENCES,
  NOTE_MAX_LENGTH,
  REFERENCE_LABELS,
  type BrandReference,
  type ReferenceLabel,
  type ReferenceSource,
} from '@/lib/brand-options'
import { toReferenceJpeg } from '@/lib/image'
import type { InstagramPost } from '@/lib/instagram'
import { paletteFromBlob } from '@/lib/palette'
import {
  classifyGridTilesAction,
  deleteReferenceAction,
  discoverPostsAction,
  importReferencesAction,
  listOwnPostsAction,
  setReferenceLabelAction,
  updateReferenceAction,
  uploadReferenceAction,
  type PostsResult,
} from './actions'
import { BUTTON, CARD, FAILED, FIELD, LABEL, PRIMARY_BUTTON } from './brand-form'

/** importReferencesAction takes at most this many at once. */
const MAX_IMPORT = 12

const SOURCE_LABELS: Record<ReferenceSource, string> = {
  upload: 'Unggahan',
  website: 'Website',
  instagram: 'Akun sendiri',
  discovery: 'Akun lain',
}

interface ReferencesPanelProps {
  references: BrandReference[]
  instagramUsername: string | null
  discoveryReady: boolean
  /** Credits one AI batch of grid tiles costs (catalog rate reference_labels). */
  labelCredits: number
}

export function ReferencesPanel({ references, instagramUsername, discoveryReady, labelCredits }: ReferencesPanelProps) {
  const [picker, setPicker] = useState<'instagram' | 'discovery' | null>(null)
  const [gridFile, setGridFile] = useState<File | null>(null)
  const gridInput = useRef<HTMLInputElement>(null)
  useMissingPalettes(references)

  const room = MAX_REFERENCES - references.length
  const permalinks = new Set(references.map((reference) => reference.permalink).filter(Boolean))

  return (
    <section aria-labelledby="referensi-desain" className="space-y-4">
      <div className="space-y-1">
        <h2 id="referensi-desain" className="text-lg font-semibold tracking-tight text-zinc-900">
          Referensi desain{' '}
          <span className="text-sm font-normal text-zinc-500">
            ({references.length}/{MAX_REFERENCES})
          </span>
        </h2>
        <p className="max-w-2xl text-sm text-zinc-500">
          Contoh desain yang ingin ditiru gayanya: unggahan, post akunmu, atau post akun Business/Creator lain. Palet
          dihitung dari piksel gambar. Tulis catatan apa yang mau diambil dari tiap referensi, lalu jalankan analisis
          visual di bagian Visual. Referensi dari akun lain hanya acuan gaya, bukan untuk di-repost.
        </p>
        <p className="max-w-2xl text-sm text-zinc-500">
          Label menentukan slide mana yang meniru gambar itu: Cover, Isi, atau CTA meniru layout-nya untuk slide
          berperan sama; Umum dipinjam gayanya oleh slide yang belum punya referensi sesuai perannya.
        </p>
      </div>

      <div className="flex flex-wrap items-start gap-2">
        <UploadReferences disabled={room <= 0} />
        <input
          ref={gridInput}
          type="file"
          accept="image/*"
          className="sr-only"
          tabIndex={-1}
          aria-hidden="true"
          onChange={(event) => {
            const file = event.target.files?.[0]
            event.target.value = ''
            if (file) {
              setGridFile(file)
              setPicker(null)
            }
          }}
        />
        <button
          type="button"
          onClick={() => gridInput.current?.click()}
          disabled={room <= 0}
          title="Potong screenshot profil atau moodboard jadi beberapa referensi"
          className={BUTTON}
        >
          <Grid2x2 size={16} aria-hidden="true" />
          Dari grid
        </button>
        {instagramUsername && (
          <button
            type="button"
            onClick={() => setPicker(picker === 'instagram' ? null : 'instagram')}
            aria-expanded={picker === 'instagram'}
            className={BUTTON}
          >
            Dari @{instagramUsername}
          </button>
        )}
        <button
          type="button"
          onClick={() => setPicker(picker === 'discovery' ? null : 'discovery')}
          aria-expanded={picker === 'discovery'}
          className={BUTTON}
        >
          <Search size={16} aria-hidden="true" />
          Dari akun lain
        </button>
      </div>

      {gridFile && (
        <div className={CARD}>
          <GridReferences
            key={`${gridFile.name}:${gridFile.lastModified}:${gridFile.size}`}
            file={gridFile}
            room={room}
            labelCredits={labelCredits}
            onDone={() => setGridFile(null)}
          />
        </div>
      )}

      {picker === 'instagram' && <OwnPosts room={room} imported={permalinks} onDone={() => setPicker(null)} />}
      {picker === 'discovery' &&
        (discoveryReady ? (
          <DiscoveryPosts room={room} imported={permalinks} onDone={() => setPicker(null)} />
        ) : (
          <Notice tone="warning">
            Membaca akun lain memakai Business Discovery, yang butuh Facebook Login.{' '}
            <Link href="/pengaturan#facebook" className="font-medium underline">
              Hubungkan Facebook di Pengaturan
            </Link>
            .
          </Notice>
        ))}

      {references.length === 0 ? (
        <p className="rounded-xl border border-dashed border-zinc-300 p-8 text-center text-sm text-zinc-500">
          Belum ada referensi.
        </p>
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {references.map((reference) => (
            // The description changes when visual analysis runs; a new key picks it up in the card's state.
            <ReferenceCard key={`${reference.id}:${reference.description}`} reference={reference} />
          ))}
        </ul>
      )}
    </section>
  )
}

/** Imported images arrive without a palette; the browser reads their pixels and saves one, then refreshes once. */
function useMissingPalettes(references: BrandReference[]) {
  const router = useRouter()
  const started = useRef(new Set<string>())

  useEffect(() => {
    const missing = references.filter((reference) => reference.palette.length === 0 && !started.current.has(reference.id))
    if (missing.length === 0) return
    for (const reference of missing) started.current.add(reference.id)

    void (async () => {
      let saved = 0
      for (const reference of missing) {
        try {
          // The card's <img> already loaded this URL without CORS, and Storage sends no `Vary: Origin`, so a
          // cached copy would lack Access-Control-Allow-Origin. A fresh request carries Origin and gets it.
          const response = await fetch(reference.images[0].url, { cache: 'no-store' })
          if (!response.ok) continue
          const palette = await paletteFromBlob(await response.blob())
          if (palette.length > 0 && (await updateReferenceAction(reference.id, { palette })) === null) saved += 1
        } catch {
          // Stays without a palette; the next visit tries again.
        }
      }
      if (saved > 0) router.refresh()
    })()
  }, [references, router])
}

function UploadReferences({ disabled }: { disabled: boolean }) {
  const router = useRouter()
  const inputRef = useRef<HTMLInputElement>(null)
  const [progress, setProgress] = useState<string | null>(null)
  const [errors, setErrors] = useState<string[]>([])

  async function upload(files: File[]) {
    const failed: string[] = []
    let uploaded = 0
    for (const [index, file] of files.entries()) {
      setProgress(`Mengunggah ${index + 1} dari ${files.length}…`)
      let failure: string | null
      try {
        const prepared = await toReferenceJpeg(file)
        const formData = new FormData()
        formData.set('file', prepared.blob, 'referensi.jpg')
        formData.set('palette', JSON.stringify(prepared.palette))
        failure = await uploadReferenceAction(formData).catch(() => 'Unggahan terputus. Coba lagi.')
      } catch {
        failure = 'Format tidak bisa dibaca browser. Ubah ke JPG atau PNG dulu.'
      }
      if (failure) failed.push(`${file.name}: ${failure}`)
      else uploaded += 1
    }
    setProgress(null)
    setErrors(failed)
    if (uploaded > 0) router.refresh()
  }

  return (
    <div className="space-y-2">
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        multiple
        className="sr-only"
        tabIndex={-1}
        aria-hidden="true"
        onChange={(event) => {
          const files = Array.from(event.target.files ?? [])
          event.target.value = ''
          if (files.length > 0) void upload(files)
        }}
      />
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={disabled || progress !== null}
        className={BUTTON}
      >
        <ImagePlus size={16} aria-hidden="true" />
        {progress ?? 'Unggah gambar'}
      </button>
      {errors.length > 0 && (
        <ul role="alert" className="space-y-0.5 text-sm text-red-700">
          {errors.map((error) => (
            <li key={error}>{error}</li>
          ))}
        </ul>
      )}
    </div>
  )
}

/** Tiles per classifyGridTilesAction call: one AI batch, so each call costs one batch's credits. */
const CLASSIFY_BATCH = 12

interface TileDetail {
  label: ReferenceLabel
  description: string
  /** What the AI did with the tile: read it, or could not. */
  ai?: 'read' | 'unread'
}

const EMPTY_DETAIL: TileDetail = { label: 'single', description: '' }

/** A grid picture cut into designs, added together as one reference (like a carousel), each with its own label. */
function GridReferences({
  file,
  room,
  labelCredits,
  onDone,
}: {
  file: File
  room: number
  labelCredits: number
  onDone: () => void
}) {
  const router = useRouter()
  const [details, setDetails] = useState<Record<string, TileDetail>>({})
  const [progress, setProgress] = useState<{
    task: 'detect' | 'add'
    text: string
  } | null>(null)
  const [errors, setErrors] = useState<string[]>([])
  const [notice, setNotice] = useState<string | null>(null)

  const detailOf = (tile: GridTile) => details[tile.key] ?? EMPTY_DETAIL
  const update = (tile: GridTile, change: Partial<TileDetail>) =>
    setDetails((previous) => ({
      ...previous,
      [tile.key]: { ...(previous[tile.key] ?? EMPTY_DETAIL), ...change },
    }))

  async function detect({ tiles, crop }: GridSelection) {
    setErrors([])
    setNotice(null)
    const found: Record<string, TileDetail> = {}
    let failure: string | null = null
    try {
      for (let start = 0; start < tiles.length; start += CLASSIFY_BATCH) {
        const batch = tiles.slice(start, start + CLASSIFY_BATCH)
        setProgress({
          task: 'detect',
          text:
            tiles.length > CLASSIFY_BATCH
              ? `Mendeteksi ${start + 1}–${start + batch.length} dari ${tiles.length}…`
              : 'Mendeteksi kategori…',
        })
        const formData = new FormData()
        for (const tile of batch) formData.append('tile', (await crop(tile)).blob, `potongan-${tile.index + 1}.jpg`)
        const response = await classifyGridTilesAction(formData).catch(() => ({
          error: FAILED,
        }))
        if ('error' in response) {
          failure = response.error
          break
        }
        batch.forEach((tile, index) => {
          const read = response.tiles[index]
          found[tile.key] = read
            ? {
                label: read.label,
                description: read.description.slice(0, DESCRIPTION_MAX_LENGTH),
                ai: 'read',
              }
            : { ...(details[tile.key] ?? EMPTY_DETAIL), ai: 'unread' }
        })
      }
    } catch {
      failure = 'Potongan gagal dibuat di browser. Coba lagi.'
    }
    setDetails((previous) => ({ ...previous, ...found }))
    setProgress(null)
    if (failure) setErrors([failure])
    const unread = Object.values(found).filter((detail) => detail.ai === 'unread').length
    if (unread > 0) setNotice(`${unread} potongan tidak terbaca AI. Pilih labelnya sendiri.`)
  }

  async function add({ tiles, crop, markAdded }: GridSelection) {
    setErrors([])
    setNotice(null)
    setProgress({ task: 'add', text: `Menambahkan ${tiles.length} potongan…` })
    let failure: string | null
    try {
      const formData = new FormData()
      const descriptions: string[] = []
      for (const [position, tile] of tiles.entries()) {
        const detail = detailOf(tile)
        const prepared = await crop(tile)
        formData.append('file', prepared.blob, `potongan-${tile.index + 1}.jpg`)
        formData.append('label', detail.label)
        if (position === 0) formData.set('palette', JSON.stringify(prepared.palette))
        if (detail.description.trim()) descriptions.push(`Slide ${position + 1}: ${detail.description.trim()}`)
      }
      if (descriptions.length > 0) formData.set('description', descriptions.join('\n').slice(0, DESCRIPTION_MAX_LENGTH))
      formData.set('source', 'grid')
      failure = await uploadReferenceAction(formData).catch(() => 'Unggahan terputus. Coba lagi.')
    } catch {
      failure = 'Potongan gagal dibuat di browser. Coba lagi.'
    }
    setProgress(null)
    setErrors(failure ? [failure] : [])
    if (failure) return
    markAdded(tiles)
    router.refresh()
    onDone()
  }

  const busy = progress !== null

  return (
    <div className="space-y-3">
      <GridSplitter
        file={file}
        maxSelectable={room <= 0 ? 0 : MAX_GROUP_IMAGES}
        limitHint={
          room <= 0
            ? 'Galeri sudah penuh. Hapus referensi lama dulu.'
            : `Satu referensi maksimal ${MAX_GROUP_IMAGES} potongan.`
        }
        busy={busy}
        onCancel={onDone}
        renderTile={(tile) => {
          const detail = detailOf(tile)
          return (
            <div className="space-y-2">
              <label className="flex items-center gap-2 text-xs text-zinc-500">
                Label
                <select
                  value={detail.label}
                  onChange={(event) =>
                    update(tile, {
                      label: event.target.value as ReferenceLabel,
                    })
                  }
                  disabled={busy}
                  className="rounded-md border border-zinc-200 bg-white px-1.5 py-1 text-xs text-zinc-900"
                >
                  {LABEL_ORDER.map((label) => (
                    <option key={label} value={label}>
                      {REFERENCE_LABELS[label]}
                    </option>
                  ))}
                </select>
                {detail.ai === 'read' && (
                  <span className="inline-flex items-center gap-0.5 text-[11px] text-primary">
                    <Sparkles size={11} aria-hidden="true" />
                    AI
                  </span>
                )}
              </label>
              <label className="block space-y-1">
                <span className="sr-only">Deskripsi potongan {tile.index + 1}</span>
                <textarea
                  value={detail.description}
                  onChange={(event) => update(tile, { description: event.target.value })}
                  disabled={busy}
                  rows={3}
                  maxLength={DESCRIPTION_MAX_LENGTH}
                  placeholder={
                    detail.ai === 'unread' ? 'AI tidak bisa membaca potongan ini.' : 'Deskripsi layout (opsional)'
                  }
                  className={`${FIELD} px-2 py-1.5 text-xs`}
                />
              </label>
            </div>
          )
        }}
      >
        {(selection) => {
          const count = selection.tiles.length
          const batches = Math.ceil(count / CLASSIFY_BATCH)
          return (
            <>
              <button
                type="button"
                onClick={() => void add(selection)}
                disabled={busy || count === 0}
                className={PRIMARY_BUTTON}
              >
                {progress?.task === 'add' ? progress.text : `Jadikan 1 referensi (${count} slide)`}
              </button>
              <button
                type="button"
                onClick={() => void detect(selection)}
                disabled={busy || count === 0}
                title={`Memakai sekitar ${batches * labelCredits} kredit`}
                className={BUTTON}
              >
                <Sparkles size={16} aria-hidden="true" className={progress?.task === 'detect' ? 'animate-pulse' : ''} />
                {progress?.task === 'detect' ? progress.text : 'Deteksi kategori dengan AI'}
              </button>
              {count > 0 && (
                <span className="text-xs text-zinc-500">
                  Opsional · memakai sekitar {batches * labelCredits} kredit
                </span>
              )}
            </>
          )
        }}
      </GridSplitter>
      {notice && <Notice tone="warning">{notice}</Notice>}
      {errors.length > 0 && (
        <ul role="alert" className="space-y-0.5 text-sm text-red-700">
          {errors.map((error) => (
            <li key={error}>{error}</li>
          ))}
        </ul>
      )}
    </div>
  )
}

interface PickerProps {
  /** How many more references fit in the gallery. */
  room: number
  /** Permalinks already in the gallery. */
  imported: Set<string | null>
  onDone: () => void
}

function OwnPosts({ room, imported, onDone }: PickerProps) {
  const [result, setResult] = useState<PostsResult | null>(null)

  useEffect(() => {
    let active = true
    listOwnPostsAction()
      .catch((): PostsResult => ({ error: FAILED }))
      .then((response) => active && setResult(response))
    return () => {
      active = false
    }
  }, [])

  if (!result) return <LoadingState variant="gallery" label="Memuat post terbaru…" />
  if ('error' in result) return <Notice tone="error">{result.error}</Notice>
  return <PostPicker result={result} source="instagram" room={room} imported={imported} onDone={onDone} />
}

function DiscoveryPosts({ room, imported, onDone }: PickerProps) {
  const [username, setUsername] = useState('')
  const [pending, setPending] = useState(false)
  const [result, setResult] = useState<PostsResult | null>(null)

  async function search(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setPending(true)
    setResult(await discoverPostsAction(username).catch((): PostsResult => ({ error: FAILED })))
    setPending(false)
  }

  return (
    <div className={CARD}>
      <form onSubmit={search} className="flex flex-wrap items-end gap-2">
        <label className={`${LABEL} min-w-60 flex-1`}>
          <span>Username atau link profil</span>
          <input
            value={username}
            onChange={(event) => setUsername(event.target.value)}
            placeholder="mis. @namaakun atau instagram.com/namaakun"
            className={FIELD}
          />
        </label>
        <button type="submit" disabled={pending || username.trim() === ''} className={PRIMARY_BUTTON}>
          {pending ? 'Mencari…' : 'Cari'}
        </button>
      </form>
      <p className="text-xs text-zinc-500">
        Hanya akun Business atau Creator. Akun personal dan akun dengan batas umur tidak bisa dibaca.
      </p>
      {result && 'error' in result && <Notice tone="error">{result.error}</Notice>}
      {result && 'posts' in result && (
        <PostPicker key={result.account.username} result={result} source="discovery" room={room} imported={imported} onDone={onDone} />
      )}
    </div>
  )
}

interface PostPickerProps extends PickerProps {
  result: Extract<PostsResult, { posts: InstagramPost[] }>
  source: 'instagram' | 'discovery'
}

function PostPicker({ result, source, room, imported, onDone }: PostPickerProps) {
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set())
  const [pending, setPending] = useState(false)
  const [errors, setErrors] = useState<string[]>([])
  const { account, posts } = result
  const limit = Math.min(MAX_IMPORT, room)

  function toggle(id: string) {
    setSelected((previous) => {
      const next = new Set(previous)
      if (next.has(id)) next.delete(id)
      else if (next.size < limit) next.add(id)
      return next
    })
  }

  async function importSelected() {
    setPending(true)
    const items = posts
      .filter((post) => selected.has(post.id))
      .map((post) => ({ imageUrls: post.images, permalink: post.permalink, source, sourceLabel: `@${account.username}` }))
    const response = await importReferencesAction(items).catch(() => ({ error: FAILED }))
    setPending(false)
    if ('error' in response) {
      setErrors([response.error])
      return
    }
    setErrors(response.failed)
    if (response.failed.length === 0) onDone()
    else setSelected(new Set())
  }

  return (
    // Discovery results sit inside the search card already.
    <div className={source === 'instagram' ? CARD : 'space-y-4'}>
      <div className="space-y-0.5 text-sm">
        <p className="font-medium text-zinc-900">
          @{account.username}
          {account.name && <span className="font-normal text-zinc-500"> · {account.name}</span>}
          {account.followersCount !== null && (
            <span className="font-normal text-zinc-500"> · {account.followersCount.toLocaleString('id-ID')} pengikut</span>
          )}
        </p>
        {account.biography && <p className="line-clamp-2 whitespace-pre-line text-zinc-500">{account.biography}</p>}
      </div>
      {posts.length === 0 ? (
        <p className="text-sm text-zinc-500">Tidak ada post bergambar yang bisa dibaca.</p>
      ) : (
        <>
          <p className="text-sm text-zinc-500">
            Pilih sampai {limit} post. Video dilewati; carousel diambil semua slide-nya.
          </p>
          <ul className="grid grid-cols-3 gap-2 sm:grid-cols-4 lg:grid-cols-6">
            {posts.map((post) => {
              const done = imported.has(post.permalink)
              const checked = selected.has(post.id)
              return (
                <li key={post.id}>
                  <button
                    type="button"
                    onClick={() => toggle(post.id)}
                    disabled={done || pending}
                    aria-pressed={checked}
                    title={post.caption.slice(0, 120)}
                    className={`relative block w-full overflow-hidden rounded-lg border-2 ${checked ? 'border-zinc-900' : 'border-transparent'} disabled:opacity-40`}
                  >
                    <ExternalImage src={post.imageUrl} className="aspect-square w-full object-cover" />
                    {checked && (
                      <span className="absolute top-1.5 right-1.5 rounded-full bg-zinc-900 p-0.5 text-white">
                        <Check size={14} aria-hidden="true" />
                      </span>
                    )}
                    {post.isCarousel && !done && (
                      <span className="absolute top-1.5 left-1.5 rounded bg-zinc-900/80 px-1.5 py-0.5 text-[11px] font-medium text-white">
                        Carousel · {post.images.length}
                      </span>
                    )}
                    {done && (
                      <span className="absolute inset-x-0 bottom-0 bg-white/90 py-0.5 text-center text-xs text-zinc-700">
                        Sudah ada
                      </span>
                    )}
                  </button>
                </li>
              )
            })}
          </ul>
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" onClick={importSelected} disabled={pending || selected.size === 0} className={PRIMARY_BUTTON}>
              {pending ? 'Mengimpor…' : `Impor ${selected.size} referensi`}
            </button>
            <button type="button" onClick={onDone} className={BUTTON}>
              Tutup
            </button>
          </div>
        </>
      )}
      {room <= 0 && <Notice tone="warning">Galeri sudah penuh. Hapus referensi lama dulu.</Notice>}
      {errors.length > 0 && (
        <ul role="alert" className="space-y-0.5 text-sm text-red-700">
          {errors.map((error) => (
            <li key={error}>{error}</li>
          ))}
        </ul>
      )}
    </div>
  )
}

function ReferenceCard({ reference }: { reference: BrandReference }) {
  const [note, setNote] = useState(reference.note)
  const [description, setDescription] = useState(reference.description)
  const [saved, setSaved] = useState({ note: reference.note, description: reference.description })
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function persist(field: 'note' | 'description', value: string) {
    if (value.trim() === saved[field]) return
    const failure = await updateReferenceAction(reference.id, { [field]: value }).catch(() => FAILED)
    setError(failure)
    if (!failure) setSaved((previous) => ({ ...previous, [field]: value.trim() }))
  }

  async function remove() {
    const slides = reference.images.length > 1 ? ` beserta ${reference.images.length} slide-nya` : ''
    if (!(await confirmDialog({
      title: 'Hapus referensi ini?',
      description: slides ? `Referensi beserta ${reference.images.length} slide-nya akan dihapus.` : 'Referensi akan dihapus.',
      confirmLabel: 'Hapus',
      tone: 'danger',
    }))) return
    setPending(true)
    setError(await deleteReferenceAction(reference.id).catch(() => FAILED))
    setPending(false)
  }

  return (
    <li className="overflow-hidden rounded-xl border border-zinc-200 bg-white">
      <ReferenceSlides images={reference.images} />
      <div className="space-y-3 p-3">
        <div className="flex items-center justify-between gap-2 text-xs text-zinc-500">
          <span className="truncate">
            {SOURCE_LABELS[reference.source]}
            {reference.sourceLabel && reference.sourceLabel !== SOURCE_LABELS[reference.source] && ` · ${reference.sourceLabel}`}
          </span>
          <span className="flex shrink-0 items-center gap-1">
            {reference.permalink && (
              <a
                href={reference.permalink}
                target="_blank"
                rel="noreferrer"
                aria-label="Buka sumber"
                className="rounded p-1 hover:bg-zinc-100 hover:text-zinc-900"
              >
                <ExternalLink size={14} aria-hidden="true" />
              </a>
            )}
            <button
              type="button"
              onClick={remove}
              disabled={pending}
              aria-label="Hapus referensi"
              className="rounded p-1 hover:bg-zinc-100 hover:text-red-600"
            >
              <Trash2 size={14} aria-hidden="true" />
            </button>
          </span>
        </div>
        {reference.palette.length > 0 ? (
          <div className="flex gap-1">
            {reference.palette.map((hex) => (
              <span key={hex} title={hex} className="h-5 flex-1 rounded border border-zinc-200" style={{ backgroundColor: hex }} />
            ))}
          </div>
        ) : (
          <p className="text-xs text-zinc-400">Menghitung palet…</p>
        )}
        <label className={LABEL}>
          <span className="text-xs">Catatanmu</span>
          <textarea
            value={note}
            onChange={(event) => setNote(event.target.value)}
            onBlur={() => void persist('note', note)}
            rows={2}
            maxLength={NOTE_MAX_LENGTH}
            placeholder="mis. ambil layout-nya, bukan warnanya"
            className={FIELD}
          />
        </label>
        <label className={LABEL}>
          <span className="text-xs">Deskripsi AI</span>
          <textarea
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            onBlur={() => void persist('description', description)}
            rows={3}
            maxLength={DESCRIPTION_MAX_LENGTH}
            placeholder="Terisi setelah analisis visual."
            className={FIELD}
          />
        </label>
        {error && <Notice tone="error">{error}</Notice>}
      </div>
    </li>
  )
}

const LABEL_ORDER = Object.keys(REFERENCE_LABELS) as ReferenceLabel[]

/**
 * A group's slides as a swipeable strip, one per view, each with its label; the select under it changes the
 * visible slide’s label, also for a one-image group.
 */
function ReferenceSlides({ images }: { images: BrandReference['images'] }) {
  const strip = useRef<HTMLDivElement>(null)
  const [current, setCurrent] = useState(0)
  const [labels, setLabels] = useState(() => images.map((image) => image.label))
  const [error, setError] = useState<string | null>(null)
  const many = images.length > 1

  function show(index: number) {
    const target = Math.max(0, Math.min(images.length - 1, index))
    const element = strip.current
    if (element) element.scrollTo({ left: target * element.clientWidth, behavior: 'smooth' })
    setCurrent(target)
  }

  async function relabel(label: ReferenceLabel) {
    const previous = labels[current]
    setLabels((list) => list.map((item, index) => (index === current ? label : item)))
    const failure = await setReferenceLabelAction(images[current].id, label).catch(() => FAILED)
    setError(failure)
    if (failure) setLabels((list) => list.map((item, index) => (index === current ? previous : item)))
  }

  return (
    <div>
      <div className="relative">
        <div
          ref={strip}
          onScroll={(event) => {
            const element = event.currentTarget
            setCurrent(Math.round(element.scrollLeft / Math.max(1, element.clientWidth)))
          }}
          className="flex snap-x snap-mandatory overflow-x-auto [scrollbar-width:none]"
        >
          {images.map((image, index) => (
            <div key={image.id} className="relative w-full shrink-0 snap-start">
              <MediaImage src={image.url} className="aspect-square w-full bg-zinc-100 object-cover" />
              {many && (
                <span className="absolute top-2 left-2 rounded bg-zinc-900/80 px-1.5 py-0.5 text-[11px] font-medium text-white">
                  {REFERENCE_LABELS[labels[index]]} · {index + 1}/{images.length}
                </span>
              )}
            </div>
          ))}
        </div>
        {many && current > 0 && (
          <button
            type="button"
            onClick={() => show(current - 1)}
            aria-label="Slide sebelumnya"
            className="absolute top-1/2 left-2 -translate-y-1/2 rounded-full bg-white/90 p-1 text-zinc-700 shadow hover:bg-white"
          >
            <ChevronLeft size={16} aria-hidden="true" />
          </button>
        )}
        {many && current < images.length - 1 && (
          <button
            type="button"
            onClick={() => show(current + 1)}
            aria-label="Slide berikutnya"
            className="absolute top-1/2 right-2 -translate-y-1/2 rounded-full bg-white/90 p-1 text-zinc-700 shadow hover:bg-white"
          >
            <ChevronRight size={16} aria-hidden="true" />
          </button>
        )}
      </div>
      <div className="flex items-center justify-between gap-2 border-b border-zinc-100 px-3 py-2">
        <label className="flex items-center gap-2 text-xs text-zinc-500">
          {many ? `Label slide ${current + 1}` : 'Label'}
          <select
            value={labels[current]}
            onChange={(event) => void relabel(event.target.value as ReferenceLabel)}
            className="rounded-md border border-zinc-200 bg-white px-1.5 py-1 text-xs text-zinc-900"
          >
            {LABEL_ORDER.map((label) => (
              <option key={label} value={label}>
                {REFERENCE_LABELS[label]}
              </option>
            ))}
          </select>
        </label>
        {error && <span className="text-xs text-red-600">{error}</span>}
      </div>
    </div>
  )
}
