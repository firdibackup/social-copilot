'use client'

import { FolderInput, Grid2x2, ImagePlus, RefreshCw, Sparkles, Trash2 } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useActionState, useMemo, useRef, useState, useTransition } from 'react'
import { GridSplitter, type GridSelection } from '@/components/grid-splitter'
import { MediaImage } from '@/components/media-image'
import { Notice } from '@/components/notice'
import { REFERENCE_LABELS, type ReferenceLabel } from '@/lib/brand-options'
import { DESIGN_STYLE_IDS, DESIGN_STYLES, type DesignStyleId } from '@/lib/design-styles'
import { toReferenceJpeg } from '@/lib/image'
import { TEMPLATE_STATUS_LABELS, type DesignTemplate, type TemplateStatus } from '@/lib/template-options'
import { analyzeTemplatesAction, importTemplatesAction, templateAction, uploadTemplateAction, type FormState } from '../actions'
import { BUTTON, CARD, CARD_TITLE, DANGER_BUTTON, FIELD, HINT, PRIMARY_BUTTON } from '../ui'

const INITIAL: FormState = { error: null, success: null }
const LABELS = Object.entries(REFERENCE_LABELS) as [ReferenceLabel, string][]

const STATUS_CLASS: Record<TemplateStatus, string> = {
  pending: 'bg-zinc-100 text-zinc-700',
  ready: 'bg-emerald-50 text-emerald-700',
  failed: 'bg-red-50 text-red-700',
}

type Filter = 'all' | DesignStyleId | 'unsorted'

export function TemplatesPanel({ templates }: { templates: DesignTemplate[] }) {
  const [filter, setFilter] = useState<Filter>('all')
  const pending = templates.filter((template) => template.status === 'pending').length
  const shown = useMemo(
    () =>
      templates.filter((template) =>
        filter === 'all' ? true : filter === 'unsorted' ? template.status !== 'ready' : template.styles.includes(filter),
      ),
    [templates, filter],
  )

  return (
    <div className="space-y-4">
      <Toolbar pending={pending} />
      <Coverage templates={templates} />

      <section className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className={CARD_TITLE}>Semua template ({templates.length})</h2>
          <select
            aria-label="Saring menurut gaya"
            value={filter}
            onChange={(event) => setFilter(event.target.value as Filter)}
            className={`${FIELD} ml-auto w-auto`}
          >
            <option value="all">Semua gaya</option>
            <option value="unsorted">Belum siap</option>
            {DESIGN_STYLE_IDS.map((id) => (
              <option key={id} value={id}>
                {DESIGN_STYLES[id].label}
              </option>
            ))}
          </select>
        </div>
        {shown.length === 0 ? (
          <p className="rounded-xl border border-dashed border-zinc-300 bg-white p-6 text-center text-sm text-zinc-500">
            {templates.length === 0
              ? 'Belum ada template. Unggah gambar atau impor contoh desain bawaan.'
              : 'Tidak ada template di saringan ini.'}
          </p>
        ) : (
          <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {shown.map((template) => (
              <TemplateCard key={template.id} template={template} />
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}

function Toolbar({ pending }: { pending: number }) {
  const router = useRouter()
  const inputRef = useRef<HTMLInputElement>(null)
  const gridRef = useRef<HTMLInputElement>(null)
  const [gridFile, setGridFile] = useState<File | null>(null)
  const [progress, setProgress] = useState<string | null>(null)
  const [errors, setErrors] = useState<string[]>([])
  const [result, setResult] = useState<FormState>(INITIAL)
  const [busy, startTransition] = useTransition()

  async function upload(files: File[]) {
    const failures: string[] = []
    let uploaded = 0
    for (const [index, file] of files.entries()) {
      setProgress(`Mengunggah ${index + 1} dari ${files.length}…`)
      let failure: string | null
      try {
        const prepared = await toReferenceJpeg(file)
        const formData = new FormData()
        formData.set('file', prepared.blob, 'template.jpg')
        failure = await uploadTemplateAction(formData).catch(() => 'Unggahan terputus. Coba lagi.')
      } catch {
        failure = 'Format tidak bisa dibaca browser. Ubah ke JPG atau PNG dulu.'
      }
      if (failure) failures.push(`${file.name}: ${failure}`)
      else uploaded += 1
    }
    setProgress(null)
    setErrors(failures)
    if (uploaded > 0) {
      setResult({
        error: null,
        success: `${uploaded} template diunggah. Klik Analisis dengan AI untuk mengelompokkannya.`,
      })
      router.refresh()
    }
  }

  async function uploadTiles({ tiles, crop, markAdded }: GridSelection) {
    setErrors([])
    setResult(INITIAL)
    const failures: string[] = []
    const done: typeof tiles = []
    for (const [position, tile] of tiles.entries()) {
      setProgress(`Menambahkan ${position + 1} dari ${tiles.length}…`)
      let failure: string | null
      try {
        const prepared = await crop(tile)
        const formData = new FormData()
        formData.set('file', prepared.blob, `potongan-${tile.index + 1}.jpg`)
        failure = await uploadTemplateAction(formData).catch(() => 'Unggahan terputus. Coba lagi.')
      } catch {
        failure = 'Potongan gagal dibuat di browser. Coba lagi.'
      }
      if (failure) failures.push(`Potongan ${tile.index + 1}: ${failure}`)
      else done.push(tile)
    }
    setProgress(null)
    setErrors(failures)
    if (done.length > 0) {
      markAdded(done)
      setResult({
        error: null,
        success: `${done.length} template dari grid ditambahkan. Klik Analisis dengan AI untuk mengelompokkannya.`,
      })
      router.refresh()
    }
    if (failures.length === 0) setGridFile(null)
  }

  const run = (action: () => Promise<FormState>) =>
    startTransition(async () => {
      setErrors([])
      setResult(
        await action().catch(() => ({
          error: 'Permintaan terputus. Coba lagi.',
          success: null,
        })),
      )
    })

  const working = busy || progress !== null

  return (
    <section className={CARD}>
      <div className="space-y-1">
        <h2 className={CARD_TITLE}>Template desain</h2>
        <p className={HINT}>
          Contoh slide yang diikuti AI saat membuat konten untuk akun yang belum punya referensi desain. AI mengelompokkan tiap
          gambar ke gaya desain (boleh lebih dari satu) dan label slide. Gaya tanpa template memakai deskripsi gayanya saja.
        </p>
      </div>
      <div className="flex flex-wrap gap-2">
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          multiple
          className="sr-only"
          tabIndex={-1}
          aria-hidden="true"
          onChange={(event) => {
            const files = [...(event.target.files ?? [])]
            event.target.value = ''
            if (files.length > 0) void upload(files)
          }}
        />
        <button type="button" className={BUTTON} disabled={working} onClick={() => inputRef.current?.click()}>
          <ImagePlus aria-hidden="true" className="size-4" />
          Unggah gambar
        </button>
        <input
          ref={gridRef}
          type="file"
          accept="image/*"
          className="sr-only"
          tabIndex={-1}
          aria-hidden="true"
          onChange={(event) => {
            const file = event.target.files?.[0]
            event.target.value = ''
            if (file) {
              setResult(INITIAL)
              setErrors([])
              setGridFile(file)
            }
          }}
        />
        <button type="button" className={BUTTON} disabled={working} onClick={() => gridRef.current?.click()}>
          <Grid2x2 aria-hidden="true" className="size-4" />
          Dari grid
        </button>
        <button type="button" className={BUTTON} disabled={working} onClick={() => run(importTemplatesAction)}>
          <FolderInput aria-hidden="true" className="size-4" />
          Impor contoh desain bawaan
        </button>
        <button
          type="button"
          className={PRIMARY_BUTTON}
          disabled={working || pending === 0}
          onClick={() => run(() => analyzeTemplatesAction(null))}
        >
          <Sparkles aria-hidden="true" className="size-4" />
          {busy ? 'Memproses…' : `Analisis dengan AI${pending > 0 ? ` (${pending})` : ''}`}
        </button>
      </div>
      {gridFile && (
        <div className="rounded-xl border border-zinc-200 bg-zinc-50/50 p-4">
          <GridSplitter
            key={`${gridFile.name}:${gridFile.lastModified}:${gridFile.size}`}
            file={gridFile}
            busy={working}
            onCancel={() => setGridFile(null)}
          >
            {(selection) => (
              <button
                type="button"
                className={PRIMARY_BUTTON}
                disabled={working || selection.tiles.length === 0}
                onClick={() => void uploadTiles(selection)}
              >
                {progress ?? `Tambahkan ${selection.tiles.length} template`}
              </button>
            )}
          </GridSplitter>
        </div>
      )}
      {progress && !gridFile && <p className="text-sm text-zinc-600">{progress}</p>}
      {result.error && <Notice tone="error">{result.error}</Notice>}
      {result.success && <Notice tone="success">{result.success}</Notice>}
      {errors.length > 0 && (
        <Notice tone="error">
          {errors.map((error) => (
            <span key={error} className="block">
              {error}
            </span>
          ))}
        </Notice>
      )}
    </section>
  )
}

/** How many ready, active templates each style has per label, so gaps show. */
function Coverage({ templates }: { templates: DesignTemplate[] }) {
  const usable = templates.filter((template) => template.status === 'ready' && template.active)
  const count = (style: DesignStyleId, label: ReferenceLabel) =>
    usable.filter((template) => template.label === label && template.styles.includes(style)).length

  return (
    <section className={`${CARD} overflow-x-auto`}>
      <h2 className={CARD_TITLE}>Template siap per gaya</h2>
      <table className="w-full text-left text-sm">
        <thead>
          <tr className="text-xs text-zinc-500">
            <th className="py-1 pr-4 font-medium">Gaya</th>
            {LABELS.map(([label, name]) => (
              <th key={label} className="px-2 py-1 text-center font-medium">
                {name}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {DESIGN_STYLE_IDS.map((style) => (
            <tr key={style} className="border-t border-zinc-100">
              <td className="py-1.5 pr-4 text-zinc-900">{DESIGN_STYLES[style].label}</td>
              {LABELS.map(([label]) => {
                const n = count(style, label)
                return (
                  <td
                    key={label}
                    className={`px-2 py-1.5 text-center tabular-nums ${n === 0 ? 'text-zinc-300' : 'text-zinc-900'}`}
                  >
                    {n}
                  </td>
                )
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  )
}

function TemplateCard({ template }: { template: DesignTemplate }) {
  const [state, action, saving] = useActionState(templateAction, INITIAL)
  const [analysis, setAnalysis] = useState<FormState>(INITIAL)
  const [analyzing, startAnalysis] = useTransition()
  const busy = saving || analyzing
  const message = analysis.error || analysis.success ? analysis : state

  return (
    <li className={`overflow-hidden rounded-xl border border-zinc-200 bg-white ${template.active ? '' : 'opacity-60'}`}>
      <div className="relative aspect-[4/5] bg-zinc-100">
        {template.url && (
          <MediaImage src={template.url} alt={template.note || 'Template desain'} className="size-full object-cover" />
        )}
        <span className={`absolute top-2 left-2 rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_CLASS[template.status]}`}>
          {TEMPLATE_STATUS_LABELS[template.status]}
        </span>
        {!template.active && (
          <span className="absolute top-2 right-2 rounded-full bg-zinc-900 px-2 py-0.5 text-xs font-medium text-white">
            Nonaktif
          </span>
        )}
      </div>

      <form action={action} className="space-y-3 p-4">
        <input type="hidden" name="templateId" value={template.id} />
        {template.error && <p className="text-xs text-red-700">{template.error}</p>}
        {template.note && <p className="text-xs text-zinc-600">{template.note}</p>}
        {template.sourceKey && <p className="text-xs text-zinc-400">Bawaan: {template.sourceKey}</p>}

        {/* Keyed so a new analysis shows its styles and label: the fields are uncontrolled. */}
        <div key={`${template.styles.join()}:${template.label}`} className="space-y-3">
          <fieldset className="space-y-1.5">
            <legend className="text-xs font-medium text-zinc-500">Gaya</legend>
            <div className="flex flex-wrap gap-1.5">
              {DESIGN_STYLE_IDS.map((id) => (
                <label
                  key={id}
                  className="inline-flex cursor-pointer items-center gap-1 rounded-full border border-zinc-200 px-2 py-0.5 text-xs text-zinc-700 has-checked:border-zinc-900 has-checked:bg-zinc-900 has-checked:text-white"
                >
                  <input
                    type="checkbox"
                    name="styles"
                    value={id}
                    defaultChecked={template.styles.includes(id)}
                    className="sr-only"
                  />
                  {DESIGN_STYLES[id].label}
                </label>
              ))}
            </div>
          </fieldset>

          <label className="block space-y-1 text-xs font-medium text-zinc-500">
            Label
            <select name="label" defaultValue={template.label ?? ''} className={FIELD}>
              <option value="" disabled>
                Pilih label
              </option>
              {LABELS.map(([label, name]) => (
                <option key={label} value={label}>
                  {name}
                </option>
              ))}
            </select>
          </label>
        </div>

        {(message.error || message.success) && (
          <Notice tone={message.error ? 'error' : 'success'}>{message.error ?? message.success}</Notice>
        )}

        <div className="flex flex-wrap gap-2">
          <button type="submit" name="intent" value="update" className={PRIMARY_BUTTON} disabled={busy}>
            Simpan
          </button>
          <button
            type="button"
            className={BUTTON}
            disabled={busy}
            onClick={() =>
              startAnalysis(async () =>
                setAnalysis(
                  await analyzeTemplatesAction(template.id).catch(() => ({
                    error: 'Permintaan terputus. Coba lagi.',
                    success: null,
                  })),
                ),
              )
            }
          >
            <RefreshCw aria-hidden="true" className={`size-4 ${analyzing ? 'animate-spin' : ''}`} />
            Analisis ulang
          </button>
          <button
            type="submit"
            name="intent"
            value={template.active ? 'deactivate' : 'activate'}
            className={BUTTON}
            disabled={busy}
            formNoValidate
          >
            {template.active ? 'Nonaktifkan' : 'Aktifkan'}
          </button>
          <button
            type="submit"
            name="intent"
            value="delete"
            className={DANGER_BUTTON}
            disabled={busy}
            aria-label="Hapus template"
            onClick={(event) => {
              if (!window.confirm('Hapus template ini? Slide yang belum dibuat tidak akan memakainya lagi.'))
                event.preventDefault()
            }}
          >
            <Trash2 aria-hidden="true" className="size-4" />
          </button>
        </div>
      </form>
    </li>
  )
}
