'use client'

import { Check, Plus, Sparkles, Trash2, WandSparkles } from 'lucide-react'
import { useEffect, useState } from 'react'
import { generateImageAction, generatorOptionsAction, planSlidesAction } from '@/app/(app)/studio/actions'
import type { Asset } from '@/lib/assets'
import {
  CONTENT_MAX_LENGTH,
  HEADLINE_MAX_LENGTH,
  IMAGE_FORMATS,
  MAX_SLIDES,
  SCENE_MAX_LENGTH,
  type GenerateResult,
  type GeneratorOptions,
  type ImageFormat,
  type PlanResult,
  type Slide,
} from '@/lib/image-options'
import { Notice } from './notice'
import { prepareAndUpload } from './upload-button'

const LABEL = 'block space-y-1 text-sm font-medium text-zinc-900'
const FIELD =
  'block w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm font-normal text-zinc-900 focus:border-zinc-400 focus:outline-none disabled:bg-zinc-50'
const PRIMARY_BUTTON =
  'inline-flex items-center gap-1.5 rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-50'
const BUTTON =
  'inline-flex items-center gap-1.5 rounded-lg border border-zinc-200 bg-white px-3 py-1.5 text-sm font-medium text-zinc-800 hover:bg-zinc-50 disabled:opacity-50'
const FAILED = 'Permintaan terputus. Coba lagi.'
const ASPECTS: Record<ImageFormat, string> = { '4:5': '4 / 5', '1:1': '1 / 1', '1.91:1': '1.91 / 1' }
const FORMATS = Object.entries(IMAGE_FORMATS) as [ImageFormat, (typeof IMAGE_FORMATS)[ImageFormat]][]

interface SlideState extends Slide {
  /** Stable React key: slides can be added and removed. */
  key: number
  image: string | null
  busy: boolean
  message: { tone: 'error' | 'warning'; text: string } | null
  selected: boolean
}

let nextKey = 0
const newSlide = (slide: Slide = { headline: '', scene: '' }): SlideState => ({
  ...slide,
  key: nextKey++,
  image: null,
  busy: false,
  message: null,
  selected: true,
})

async function fileFromDataUrl(dataUrl: string, name: string): Promise<File> {
  const blob = await (await fetch(dataUrl)).blob()
  return new File([blob], name, { type: blob.type })
}

interface ImageGeneratorProps {
  /** `form` attribute for every field, when the generator sits inside another form (the post editor). */
  formId?: string
  /** Text the planner can start from, such as the post's caption. */
  sourceText?: string
  /** How many more images the destination takes. */
  room: number
  saveLabel: string
  /** Called with the saved images, in slide order. */
  onSaved?: (assets: Asset[]) => void
}

/**
 * Plans slides from the content, generates each through 9Router with the brand kit, and saves the chosen ones to Aset
 * through the same browser crop and upload as a manual upload. Nothing is stored before the owner saves.
 */
export function ImageGenerator({ formId, sourceText = '', room, saveLabel, onSaved }: ImageGeneratorProps) {
  const [options, setOptions] = useState<GeneratorOptions | null>(null)
  const [optionsError, setOptionsError] = useState<string | null>(null)
  const [content, setContent] = useState('')
  const [format, setFormat] = useState<ImageFormat>('4:5')
  const [referenceId, setReferenceId] = useState<string | null>(null)
  const [includeLogo, setIncludeLogo] = useState(false)
  const [matchFirst, setMatchFirst] = useState(true)
  const [slides, setSlides] = useState<SlideState[]>([])
  const [planning, setPlanning] = useState(false)
  const [running, setRunning] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [notice, setNotice] = useState<{ tone: 'success' | 'warning' | 'error'; text: string } | null>(null)

  useEffect(() => {
    let active = true
    generatorOptionsAction()
      .catch(() => ({ error: FAILED }))
      .then((result) => {
        if (!active) return
        if ('error' in result) setOptionsError(result.error)
        else setOptions(result)
      })
    return () => {
      active = false
    }
  }, [])

  const busy = planning || running !== null || saving
  const reference = options?.references.find((item) => item.id === referenceId) ?? null
  const chosen = slides.filter((slide): slide is SlideState & { image: string } => slide.selected && slide.image !== null)
  const update = (key: number, patch: Partial<SlideState>) =>
    setSlides((current) => current.map((slide) => (slide.key === key ? { ...slide, ...patch } : slide)))

  async function plan() {
    setPlanning(true)
    setNotice(null)
    const result: PlanResult = await planSlidesAction(content).catch(() => ({ error: FAILED }))
    setPlanning(false)
    if ('error' in result) setNotice({ tone: 'error', text: result.error })
    else setSlides(result.slides.map((slide) => newSlide(slide)))
  }

  /** Returns the image, so a run can hand slide 1 to the slides after it. */
  async function generate(slide: SlideState, index: number, count: number, previousImage: string | null) {
    update(slide.key, { busy: true, message: null })
    const result: GenerateResult = await generateImageAction({
      headline: slide.headline,
      scene: slide.scene,
      format,
      referenceId,
      includeLogo,
      previousImage: index > 0 && matchFirst ? previousImage : null,
      slide: count > 1 ? { index: index + 1, count } : null,
    }).catch(() => ({ error: FAILED }))
    if ('error' in result) {
      update(slide.key, { busy: false, message: { tone: 'error', text: result.error } })
      return null
    }
    const message = result.skipped.length > 0 ? { tone: 'warning' as const, text: `Dilewati: ${result.skipped.join(', ')}.` } : null
    update(slide.key, { busy: false, image: result.image, selected: true, message })
    return result.image
  }

  /** Slides without an image, one at a time; server actions run one after another per tab anyway. */
  async function generateMissing() {
    const snapshot = slides
    let first = snapshot[0]?.image ?? null
    setNotice(null)
    for (const [index, slide] of snapshot.entries()) {
      if (slide.image || !slide.scene.trim()) continue
      setRunning(`Membuat slide ${index + 1} dari ${snapshot.length}…`)
      const image = await generate(slide, index, snapshot.length, first)
      if (index === 0) first = image
    }
    setRunning(null)
  }

  async function regenerate(slide: SlideState, index: number) {
    setRunning(`Membuat ulang slide ${index + 1}…`)
    await generate(slide, index, slides.length, slides[0]?.image ?? null)
    setRunning(null)
  }

  async function save() {
    const picked = chosen.slice(0, room)
    setSaving(true)
    setNotice(null)
    const saved: Asset[] = []
    const failed: string[] = []
    const savedKeys = new Set<number>()
    for (const [position, slide] of picked.entries()) {
      const result = await prepareAndUpload(await fileFromDataUrl(slide.image, `gambar-ai-${position + 1}.jpg`))
      if ('asset' in result) {
        saved.push(result.asset)
        savedKeys.add(slide.key)
      } else failed.push(`Gambar ${position + 1}: ${result.error}`)
    }
    setSaving(false)
    if (saved.length > 0) {
      onSaved?.(saved)
      // Unticked so a second click doesn't store the same images twice.
      setSlides((current) => current.map((slide) => (savedKeys.has(slide.key) ? { ...slide, selected: false } : slide)))
    }
    const over = chosen.length > room ? ` ${chosen.length - room} gambar tidak muat (maksimal 10 foto per post).` : ''
    setNotice(
      failed.length > 0
        ? { tone: 'error', text: `${failed.join(' ')}${over}` }
        : { tone: over ? 'warning' : 'success', text: `${saved.length} gambar tersimpan di Aset.${over}` },
    )
  }

  return (
    <div className="space-y-4">
      <fieldset disabled={busy} className="space-y-3">
        <label className={LABEL}>
          <span>Isi konten</span>
          <textarea
            form={formId}
            rows={3}
            maxLength={CONTENT_MAX_LENGTH}
            value={content}
            onChange={(event) => setContent(event.target.value)}
            placeholder="Topik atau caption post, mis. 5 kesalahan grammar yang sering dibuat pemula"
            className={FIELD}
          />
        </label>
        {sourceText.trim() && (
          <button type="button" onClick={() => setContent(sourceText)} className={BUTTON}>
            Isi dari caption
          </button>
        )}

        <div className="grid gap-3 sm:grid-cols-2">
          <label className={LABEL}>
            <span>Format</span>
            <select
              form={formId}
              value={format}
              onChange={(event) => setFormat(event.target.value as ImageFormat)}
              className={FIELD}
            >
              {FORMATS.map(([value, { label }]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <label className={LABEL}>
            <span>Referensi desain</span>
            <select
              form={formId}
              value={referenceId ?? ''}
              onChange={(event) => setReferenceId(event.target.value || null)}
              disabled={!options || options.references.length === 0}
              className={FIELD}
            >
              <option value="">Tanpa referensi</option>
              {options?.references.map((item, index) => (
                <option key={item.id} value={item.id}>
                  {index + 1}. {item.label}
                </option>
              ))}
            </select>
          </label>
        </div>
        {reference && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={reference.url} alt="" className="h-24 rounded-lg border border-zinc-200 object-cover" />
        )}
        <div className="flex flex-wrap gap-x-5 gap-y-2 text-sm text-zinc-800">
          {options?.hasLogo && (
            <label className="flex items-center gap-2">
              <input form={formId} type="checkbox" checked={includeLogo} onChange={(event) => setIncludeLogo(event.target.checked)} />
              Sertakan logo
            </label>
          )}
          {slides.length > 1 && (
            <label className="flex items-center gap-2">
              <input form={formId} type="checkbox" checked={matchFirst} onChange={(event) => setMatchFirst(event.target.checked)} />
              Samakan slide lain dengan slide 1
            </label>
          )}
        </div>
        {optionsError && <Notice tone="warning">{optionsError}</Notice>}
        {options && !options.brandName && (
          <p className="text-xs text-zinc-500">Brand kit masih kosong. Isi di halaman Brand supaya gambar memakai gaya, palet, dan font brand.</p>
        )}

        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={plan} disabled={!content.trim()} className={PRIMARY_BUTTON}>
            <Sparkles size={16} aria-hidden="true" />
            {planning ? 'AI menyusun slide…' : 'Rencanakan slide'}
          </button>
          <button
            type="button"
            onClick={() => setSlides((current) => [...current, newSlide()])}
            disabled={slides.length >= MAX_SLIDES}
            className={BUTTON}
          >
            <Plus size={16} aria-hidden="true" />
            Slide manual
          </button>
        </div>
      </fieldset>

      {slides.length > 0 && (
        <ol className="grid gap-4 sm:grid-cols-2">
          {slides.map((slide, index) => (
            <li key={slide.key} className="space-y-3 rounded-xl border border-zinc-200 bg-white p-3">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-semibold tracking-wide text-zinc-500 uppercase">
                  {slides.length > 1 ? `Slide ${index + 1}` : 'Gambar'}
                </span>
                <div className="flex items-center gap-3">
                  {slide.image && (
                    <label className="flex items-center gap-1.5 text-sm text-zinc-800">
                      <input
                        form={formId}
                        type="checkbox"
                        checked={slide.selected}
                        disabled={busy}
                        onChange={(event) => update(slide.key, { selected: event.target.checked })}
                      />
                      Pilih
                    </label>
                  )}
                  <button
                    type="button"
                    aria-label={`Hapus slide ${index + 1}`}
                    disabled={busy}
                    onClick={() => setSlides((current) => current.filter((item) => item.key !== slide.key))}
                    className="rounded p-1 text-zinc-500 hover:bg-zinc-100 hover:text-red-600 disabled:opacity-40"
                  >
                    <Trash2 size={16} aria-hidden="true" />
                  </button>
                </div>
              </div>
              <div
                style={{ aspectRatio: ASPECTS[format] }}
                className="flex items-center justify-center overflow-hidden rounded-lg bg-zinc-100 text-xs text-zinc-400"
              >
                {slide.image ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={slide.image} alt={slide.headline || `Slide ${index + 1}`} className="size-full object-cover" />
                ) : slide.busy ? (
                  'Membuat gambar… sekitar 30–40 detik'
                ) : (
                  'Belum dibuat'
                )}
              </div>
              <fieldset disabled={busy} className="space-y-2">
                <label className={LABEL}>
                  <span className="text-xs">Teks di gambar (opsional, ditulis persis)</span>
                  <textarea
                    form={formId}
                    rows={2}
                    value={slide.headline}
                    maxLength={HEADLINE_MAX_LENGTH}
                    onChange={(event) => update(slide.key, { headline: event.target.value })}
                    placeholder="Baris pertama jadi judul. Kosong = tanpa teks sama sekali"
                    className={FIELD}
                  />
                </label>
                <label className={LABEL}>
                  <span className="text-xs">Deskripsi gambar</span>
                  <textarea
                    form={formId}
                    rows={3}
                    value={slide.scene}
                    maxLength={SCENE_MAX_LENGTH}
                    onChange={(event) => update(slide.key, { scene: event.target.value })}
                    placeholder="Apa yang terlihat: subjek, tempat, komposisi, suasana"
                    className={FIELD}
                  />
                </label>
                <button
                  type="button"
                  onClick={() => void regenerate(slide, index)}
                  disabled={!slide.scene.trim()}
                  className={BUTTON}
                >
                  <WandSparkles size={16} aria-hidden="true" />
                  {slide.image ? 'Buat ulang' : 'Buat gambar'}
                </button>
              </fieldset>
              {slide.message && <Notice tone={slide.message.tone}>{slide.message.text}</Notice>}
            </li>
          ))}
        </ol>
      )}

      {slides.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={generateMissing}
            disabled={busy || !slides.some((slide) => !slide.image && slide.scene.trim())}
            className={PRIMARY_BUTTON}
          >
            <WandSparkles size={16} aria-hidden="true" />
            Buat semua yang belum
          </button>
          <button type="button" onClick={save} disabled={busy || chosen.length === 0 || room <= 0} className={BUTTON}>
            <Check size={16} aria-hidden="true" />
            {saving ? 'Menyimpan…' : `${saveLabel} (${Math.min(chosen.length, Math.max(room, 0))})`}
          </button>
          <span aria-live="polite" className="text-sm text-zinc-600">
            {running}
          </span>
        </div>
      )}
      {room <= 0 && slides.length > 0 && <Notice tone="warning">Post sudah berisi 10 foto. Lepas foto dulu.</Notice>}
      {notice && <Notice tone={notice.tone}>{notice.text}</Notice>}
      <p className="text-xs text-zinc-500">
        Gambar dibuat lewat 9Router satu per satu (sekitar 30–40 detik per gambar) dan baru tersimpan setelah kamu memilih.
        Setiap gambar dihitung satu permintaan dari batas AI harian.
      </p>
    </div>
  )
}
