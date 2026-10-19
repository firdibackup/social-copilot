'use client'

import { ImagePlus, Plus, Sparkles, X } from 'lucide-react'
import { useRef, useState, type FormEvent, type ReactNode } from 'react'
import { DesignStylePicker, FontPreview, FontSelect } from '@/components/design-style-picker'
import { ExternalImage, MediaImage } from '@/components/media-image'
import { Notice } from '@/components/notice'
import {
  BRAND_TEXT_LIMITS,
  COLOR_ROLES,
  FIELD_LABELS,
  MAX_COLORS,
  MAX_LOGO_BYTES,
  type BrandColor,
  type BrandFields,
  type BrandKit,
  type BrandReference,
  type BrandTextField,
  type ColorRole,
} from '@/lib/brand-options'
import {
  ACCOUNT_KINDS,
  DEFAULT_BODY_FONT,
  DEFAULT_HEADING_FONT,
  designStyleOf,
  isAccountKind,
  type AccountKind,
} from '@/lib/design-styles'
import {
  analyzeProfileAction,
  analyzeVisualAction,
  logoFromUrlAction,
  removeLogoAction,
  saveBrandAction,
  uploadLogoAction,
  type ProfileResult,
  type VisualResult,
  type WebsiteSuggestions,
} from './actions'

export const LABEL = 'block space-y-1 text-sm font-medium text-zinc-900'
export const FIELD =
  'block w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm font-normal text-zinc-900 focus:border-zinc-400 focus:outline-none'
export const PRIMARY_BUTTON =
  'inline-flex items-center gap-1.5 rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-50'
export const BUTTON =
  'inline-flex items-center gap-1.5 rounded-lg border border-zinc-200 bg-white px-3 py-1.5 text-sm font-medium text-zinc-800 hover:bg-zinc-50 disabled:opacity-50'
export const CARD = 'space-y-4 rounded-xl border border-zinc-200 bg-white p-5'
export const FAILED = 'Gagal menghubungi server. Coba lagi.'
/** Fields the AI filled that the owner hasn't saved yet. */
const SUGGESTED = 'border-amber-300 bg-amber-50/40'
const LOGO_TYPES = 'image/png,image/jpeg,image/webp'
const MAX_REFERENCE_SUGGESTIONS = 10

/** The editable part of the kit; the logo has its own actions. */
function fieldsOf(kit: BrandKit): BrandFields {
  const fields: Partial<BrandKit> = { ...kit }
  delete fields.logoUrl
  return fields as BrandFields
}
interface BrandFormProps {
  kit: BrandKit
  references: BrandReference[]
  instagramUsername: string | null
  visualLimit: number
}

export function BrandForm({ kit, references, instagramUsername, visualLimit }: BrandFormProps) {
  const [fields, setFields] = useState<BrandFields>(() => fieldsOf(kit))
  const [saved, setSaved] = useState<BrandFields>(() => fieldsOf(kit))
  const [suggested, setSuggested] = useState<ReadonlySet<BrandTextField>>(new Set())
  const [website, setWebsite] = useState<WebsiteSuggestions | null>(null)
  const [pending, setPending] = useState(false)
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null)

  const dirty = JSON.stringify(fields) !== JSON.stringify(saved)

  function update<K extends keyof BrandFields>(field: K, value: BrandFields[K]) {
    setFields((previous) => ({ ...previous, [field]: value }))
    setResult(null)
    if (field !== 'colors') {
      setSuggested((previous) => new Set([...previous].filter((name) => name !== field)))
    }
  }

  /** AI output fills only fields it has something new for, and marks them until the owner saves. */
  function applyDraft(draft: Partial<Record<BrandTextField, string>>) {
    const changed = (Object.entries(draft) as [BrandTextField, string][]).filter(
      ([field, value]) => value && value !== fields[field],
    )
    setFields((previous) => ({ ...previous, ...Object.fromEntries(changed) }))
    setSuggested((previous) => new Set([...previous, ...changed.map(([field]) => field)]))
    setResult(null)
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setPending(true)
    const failure = await saveBrandAction(fields).catch(() => FAILED)
    setPending(false)
    if (failure) {
      setResult({ ok: false, message: failure })
      return
    }
    setSaved(fields)
    setSuggested(new Set())
    setResult({ ok: true, message: 'Brand kit tersimpan. Buat AI memakainya mulai permintaan berikutnya.' })
  }

  const text = (field: BrandTextField, options: { rows?: number; placeholder?: string; hint?: string } = {}) => (
    <TextField
      field={field}
      value={fields[field]}
      suggested={suggested.has(field)}
      onChange={(value) => update(field, value)}
      {...options}
    />
  )

  return (
    <form onSubmit={save} className="space-y-6">
      <AnalysisCard
        websiteUrl={fields.websiteUrl}
        onWebsiteUrlChange={(value) => update('websiteUrl', value)}
        websiteSuggested={suggested.has('websiteUrl')}
        instagramUsername={instagramUsername}
        website={website}
        hasLogo={kit.logoUrl !== null}
        onResult={(draft, suggestions) => {
          applyDraft(draft)
          setWebsite(suggestions)
        }}
      />

      <Section title="Identitas">
        <div className="grid gap-4 sm:grid-cols-3">
          {text('name', { placeholder: 'mis. Kopi Sinar' })}
          {text('category', { placeholder: 'mis. Kedai kopi' })}
          <AccountKindField value={fields.accountKind} onChange={(value) => update('accountKind', value)} />
        </div>
        {text('description', { rows: 3, placeholder: 'Apa yang ditawarkan dan apa bedanya.' })}
      </Section>

      <Section title="Suara">
        {text('audience', { placeholder: 'mis. Mahasiswa dan pekerja muda di Bandung' })}
        {text('voice', {
          rows: 3,
          placeholder: 'mis. Santai, pakai “kamu”, kalimat pendek, satu-dua emoji.',
        })}
        <div className="grid gap-4 sm:grid-cols-2">
          {text('wordsUse', { rows: 2, placeholder: 'Tagline atau kata khas, dipisah koma' })}
          {text('wordsAvoid', { rows: 2, placeholder: 'mis. murah, termurah, gratis ongkir' })}
        </div>
        {text('facts', {
          rows: 5,
          placeholder: '- Buka setiap hari 08.00–22.00 WIB\n- Jl. Contoh No. 1, Bandung',
          hint: 'Hanya fakta di sini (dan di brief) yang boleh dipakai AI di caption.',
        })}
      </Section>

      <Section title="Visual">
        <div className="space-y-2">
          <p className="text-sm font-medium text-zinc-900">{FIELD_LABELS.designStyle}</p>
          <p className="text-xs text-zinc-500">
            Menentukan font, perlakuan teks, dan kesan desain. Referensi Instagram tetap jadi acuan susunan layout.
          </p>
          <DesignStylePicker
            value={fields.designStyle}
            onChange={(value) => update('designStyle', value)}
            palette={primaryPalette(fields.colors)}
          />
        </div>
        <LogoField logoUrl={kit.logoUrl} />
        <PaletteField
          colors={fields.colors}
          onChange={(colors) => update('colors', colors)}
          websiteColors={website?.colors ?? []}
          references={references}
        />
        <FontFields fields={fields} suggested={suggested} fonts={website?.fonts ?? []} onChange={update} />
        <VisualStyleField
          value={fields.visualStyle}
          suggested={suggested.has('visualStyle')}
          onChange={(value) => update('visualStyle', value)}
          onAnalyzed={(visualStyle, colors) => {
            applyDraft({ visualStyle })
            if (fields.colors.length === 0 && colors.length > 0) {
              update('colors', colors.slice(0, MAX_COLORS).map((hex, index) => ({ hex, role: ROLE_ORDER[index] ?? 'aksen' })))
            }
          }}
          referenceCount={Math.min(references.length, visualLimit)}
        />
      </Section>

      <div className="sticky bottom-4 z-10 flex flex-wrap items-center gap-3 rounded-xl border border-zinc-200 bg-white/95 p-3 shadow-sm backdrop-blur">
        <button type="submit" disabled={pending || !dirty} className={PRIMARY_BUTTON}>
          {pending ? 'Menyimpan…' : 'Simpan brand kit'}
        </button>
        {dirty && !result && (
          <span className="text-sm text-amber-700">
            Ada perubahan yang belum disimpan{suggested.size > 0 ? ', termasuk isian AI yang ditandai kuning' : ''}.
          </span>
        )}
        {result && (
          <span role={result.ok ? 'status' : 'alert'} className={`text-sm ${result.ok ? 'text-emerald-700' : 'text-red-700'}`}>
            {result.message}
          </span>
        )}
      </div>
    </form>
  )
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className={CARD}>
      <h2 className="font-medium text-zinc-900">{title}</h2>
      {children}
    </section>
  )
}

interface TextFieldProps {
  field: BrandTextField
  value: string
  suggested: boolean
  onChange: (value: string) => void
  rows?: number
  placeholder?: string
  hint?: string
}

function TextField({ field, value, suggested, onChange, rows, placeholder, hint }: TextFieldProps) {
  const className = `${FIELD} ${suggested ? SUGGESTED : ''}`
  const limit = BRAND_TEXT_LIMITS[field]
  return (
    <label className={LABEL}>
      <span>
        {FIELD_LABELS[field]}
        {suggested && <span className="ml-2 text-xs font-normal text-amber-700">diisi AI</span>}
      </span>
      {rows ? (
        <textarea
          value={value}
          onChange={(event) => onChange(event.target.value)}
          rows={rows}
          maxLength={limit}
          placeholder={placeholder}
          className={className}
        />
      ) : (
        <input
          value={value}
          onChange={(event) => onChange(event.target.value)}
          maxLength={limit}
          placeholder={placeholder}
          className={className}
        />
      )}
      {hint && <span className="block text-xs font-normal text-zinc-500">{hint}</span>}
    </label>
  )
}

interface AnalysisCardProps {
  websiteUrl: string
  onWebsiteUrlChange: (value: string) => void
  websiteSuggested: boolean
  instagramUsername: string | null
  website: WebsiteSuggestions | null
  hasLogo: boolean
  onResult: (draft: Partial<Record<BrandTextField, string>>, website: WebsiteSuggestions | null) => void
}

function AnalysisCard(props: AnalysisCardProps) {
  const { websiteUrl, onWebsiteUrlChange, websiteSuggested, instagramUsername, website, hasLogo, onResult } = props
  const [includeInstagram, setIncludeInstagram] = useState(instagramUsername !== null)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [warnings, setWarnings] = useState<string[]>([])

  async function analyze() {
    setPending(true)
    setError(null)
    setWarnings([])
    const response: ProfileResult = await analyzeProfileAction(websiteUrl, includeInstagram && instagramUsername !== null).catch(
      () => ({ error: FAILED }),
    )
    setPending(false)
    if ('error' in response) {
      setError(response.error)
      return
    }
    setWarnings(response.warnings)
    // The page that answered, after redirects, is the address worth keeping.
    onResult(response.website ? { ...response.draft, websiteUrl: response.website.url } : response.draft, response.website)
  }

  return (
    <section className={`${CARD} border-zinc-300 bg-zinc-50`}>
      <div className="space-y-1">
        <h2 className="flex items-center gap-2 font-medium text-zinc-900">
          <Sparkles size={16} aria-hidden="true" />
          Isi otomatis
        </h2>
        <p className="text-sm text-zinc-500">
          AI membaca halaman depan dan hingga 10 halaman lain, ditambah bio serta 12 caption terbaru akunmu. Hasilnya hanya mengisi draf.
        </p>
      </div>
      <label className={LABEL}>
        <span>{FIELD_LABELS.websiteUrl}</span>
        <input
          value={websiteUrl}
          onChange={(event) => onWebsiteUrlChange(event.target.value)}
          maxLength={BRAND_TEXT_LIMITS.websiteUrl}
          placeholder="mis. kopisinar.id"
          inputMode="url"
          className={`${FIELD} ${websiteSuggested ? SUGGESTED : ''}`}
        />
      </label>
      {instagramUsername ? (
        <label className="flex items-center gap-2 text-sm text-zinc-800">
          <input type="checkbox" checked={includeInstagram} onChange={(event) => setIncludeInstagram(event.target.checked)} />
          Sertakan akun Instagram @{instagramUsername}
        </label>
      ) : (
        <p className="text-sm text-zinc-500">Hubungkan Instagram di Pengaturan supaya bio dan caption ikut dibaca.</p>
      )}
      <button type="button" onClick={analyze} disabled={pending} className={PRIMARY_BUTTON}>
        <Sparkles size={16} aria-hidden="true" />
        {pending ? 'Membaca sumber dan menyusun profil…' : 'Analisis'}
      </button>
      {error && <Notice tone="error">{error}</Notice>}
      {warnings.map((warning) => (
        <Notice key={warning} tone="warning">
          {warning}
        </Notice>
      ))}
      {website && <WebsiteImages website={website} hasLogo={hasLogo} />}
    </section>
  )
}

function WebsiteImages({ website, hasLogo }: { website: WebsiteSuggestions; hasLogo: boolean }) {
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null)
  const [busy, setBusy] = useState<string | null>(null)

  async function run(url: string, action: () => Promise<string | null>, success: string) {
    setBusy(url)
    const failure = await action().catch(() => FAILED)
    setBusy(null)
    setMessage(failure ? { ok: false, text: failure } : { ok: true, text: success })
  }

  const useAsLogo = (url: string) => run(url, () => logoFromUrlAction(url), 'Logo dipasang.')
  if ((hasLogo || website.logoUrls.length === 0) && website.imageUrls.length === 0) return null
  return (
    <div className="space-y-3">
      {!hasLogo && (
        <ImageChoices title="Kandidat logo" urls={website.logoUrls} busy={busy} label="Pakai sebagai logo" onPick={useAsLogo} />
      )}
      {website.imageUrls.length > 0 && (
        <p className="text-xs text-zinc-500">Gambar website dikelola di Aset, bukan Referensi desain.</p>
      )}
      {message && <Notice tone={message.ok ? 'success' : 'error'}>{message.text}</Notice>}
    </div>
  )
}

interface ImageChoicesProps {
  title: string
  urls: string[]
  busy: string | null
  label: string
  onPick: (url: string) => void
}

function ImageChoices({ title, urls, busy, label, onPick }: ImageChoicesProps) {
  if (urls.length === 0) return null
  return (
    <div className="space-y-2">
      <p className="text-xs font-semibold tracking-wide text-zinc-500 uppercase">{title}</p>
      <ul className="flex flex-wrap gap-3">
        {urls.map((url) => (
          <li key={url} className="w-36 space-y-1.5">
            <div className="flex h-24 items-center justify-center overflow-hidden rounded-lg border border-zinc-200 bg-white p-2">
              <ExternalImage src={url} className="max-h-full max-w-full object-contain" />
            </div>
            <button type="button" onClick={() => onPick(url)} disabled={busy !== null} className={`${BUTTON} w-full justify-center text-xs`}>
              {busy === url ? 'Memproses…' : label}
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}

function LogoField({ logoUrl }: { logoUrl: string | null }) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function run(action: () => Promise<string | null>) {
    setPending(true)
    setError(await action().catch(() => FAILED))
    setPending(false)
  }

  function upload(file: File) {
    if (file.size > MAX_LOGO_BYTES) {
      setError('Ukuran logo harus di bawah 2 MB.')
      return
    }
    const formData = new FormData()
    formData.set('file', file)
    void run(() => uploadLogoAction(formData))
  }

  return (
    <div className="space-y-2">
      <p className="text-sm font-medium text-zinc-900">Logo</p>
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex size-20 items-center justify-center overflow-hidden rounded-lg border border-zinc-200 bg-zinc-50 p-2">
          {logoUrl ? (
            <MediaImage src={logoUrl} alt="Logo brand" className="max-h-full max-w-full object-contain" />
          ) : (
            <span className="text-xs text-zinc-400">Belum ada</span>
          )}
        </div>
        <input
          ref={inputRef}
          type="file"
          accept={LOGO_TYPES}
          className="sr-only"
          tabIndex={-1}
          aria-hidden="true"
          onChange={(event) => {
            const file = event.target.files?.[0]
            event.target.value = ''
            if (file) upload(file)
          }}
        />
        <button type="button" onClick={() => inputRef.current?.click()} disabled={pending} className={BUTTON}>
          <ImagePlus size={16} aria-hidden="true" />
          {pending ? 'Memproses…' : logoUrl ? 'Ganti logo' : 'Unggah logo'}
        </button>
        {logoUrl && (
          <button
            type="button"
            onClick={() => {
              if (window.confirm('Hapus logo?')) void run(removeLogoAction)
            }}
            disabled={pending}
            className={`${BUTTON} hover:text-red-600`}
          >
            Hapus
          </button>
        )}
      </div>
      <p className="text-xs text-zinc-500">PNG (boleh transparan), JPEG, atau WebP, maksimal 2 MB. Langsung tersimpan.</p>
      {error && <Notice tone="error">{error}</Notice>}
    </div>
  )
}

const ROLE_ORDER = Object.keys(COLOR_ROLES) as ColorRole[]

/** The first role the palette doesn't have yet, so swatches land as Utama, Sekunder, … in turn. */
const nextRole = (colors: BrandColor[]): ColorRole =>
  ROLE_ORDER.find((role) => !colors.some((color) => color.role === role)) ?? 'aksen'

/** The colours most often found across the references' palettes. */
function referenceColors(references: BrandReference[]): string[] {
  const counts = new Map<string, number>()
  for (const hex of references.flatMap((reference) => reference.palette)) counts.set(hex, (counts.get(hex) ?? 0) + 1)
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([hex]) => hex)
    .slice(0, MAX_REFERENCE_SUGGESTIONS)
}

interface PaletteFieldProps {
  colors: BrandColor[]
  onChange: (colors: BrandColor[]) => void
  websiteColors: string[]
  references: BrandReference[]
}

function PaletteField({ colors, onChange, websiteColors, references }: PaletteFieldProps) {
  const full = colors.length >= MAX_COLORS
  const used = new Set(colors.map((color) => color.hex))
  const add = (hex: string) => !full && onChange([...colors, { hex, role: nextRole(colors) }])
  const change = (index: number, patch: Partial<BrandColor>) =>
    onChange(colors.map((color, position) => (position === index ? { ...color, ...patch } : color)))

  return (
    <div className="space-y-3">
      <p className="text-sm font-medium text-zinc-900">
        Palet warna <span className="font-normal text-zinc-500">({colors.length}/{MAX_COLORS})</span>
      </p>
      {colors.length > 0 && (
        <ul className="space-y-2">
          {colors.map((color, index) => (
            <li key={index} className="flex flex-wrap items-center gap-2">
              <input
                type="color"
                value={color.hex}
                onChange={(event) => change(index, { hex: event.target.value })}
                aria-label={`Warna ${index + 1}`}
                className="h-9 w-12 cursor-pointer rounded border border-zinc-200 bg-white"
              />
              <code className="w-20 text-sm text-zinc-700">{color.hex}</code>
              <select
                value={color.role}
                onChange={(event) => change(index, { role: event.target.value as ColorRole })}
                aria-label={`Peran warna ${index + 1}`}
                className={`${FIELD} w-auto`}
              >
                {ROLE_ORDER.map((role) => (
                  <option key={role} value={role}>
                    {COLOR_ROLES[role]}
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={() => onChange(colors.filter((_, position) => position !== index))}
                aria-label={`Hapus warna ${color.hex}`}
                className="rounded p-1 text-zinc-500 hover:bg-zinc-100 hover:text-red-600"
              >
                <X size={16} aria-hidden="true" />
              </button>
            </li>
          ))}
        </ul>
      )}
      <button type="button" onClick={() => add('#000000')} disabled={full} className={BUTTON}>
        <Plus size={16} aria-hidden="true" />
        Warna
      </button>
      <Swatches title="Saran dari website" colors={websiteColors} used={used} disabled={full} onPick={add} />
      <Swatches title="Saran dari referensi" colors={referenceColors(references)} used={used} disabled={full} onPick={add} />
    </div>
  )
}

interface SwatchesProps {
  title: string
  colors: string[]
  used: Set<string>
  disabled: boolean
  onPick: (hex: string) => void
}

function Swatches({ title, colors, used, disabled, onPick }: SwatchesProps) {
  const available = colors.filter((hex) => !used.has(hex))
  if (available.length === 0) return null
  return (
    <div className="space-y-1.5">
      <p className="text-xs text-zinc-500">{title} (klik untuk menambah)</p>
      <div className="flex flex-wrap gap-1.5">
        {available.map((hex) => (
          <button
            key={hex}
            type="button"
            onClick={() => onPick(hex)}
            disabled={disabled}
            title={hex}
            aria-label={`Tambah ${hex}`}
            className="size-8 rounded-md border border-zinc-200 shadow-sm disabled:opacity-40"
            style={{ backgroundColor: hex }}
          />
        ))}
      </div>
    </div>
  )
}

interface FontFieldsProps {
  fields: BrandFields
  suggested: ReadonlySet<BrandTextField>
  fonts: string[]
  onChange: (field: 'headingFont' | 'bodyFont', value: string) => void
}

function FontFields({ fields, suggested, fonts, onChange }: FontFieldsProps) {
  const style = designStyleOf(fields.designStyle)
  const recommended = { headingFont: style?.headingFont ?? DEFAULT_HEADING_FONT, bodyFont: style?.bodyFont ?? DEFAULT_BODY_FONT }
  return (
    <div className="space-y-3">
      <div className="grid gap-4 sm:grid-cols-2">
        {(['headingFont', 'bodyFont'] as const).map((field) => (
          <FontSelect
            key={field}
            label={FIELD_LABELS[field]}
            value={fields[field]}
            onChange={(value) => onChange(field, value)}
            recommended={recommended[field]}
            extra={fonts}
            className={suggested.has(field) ? SUGGESTED : ''}
          />
        ))}
      </div>
      <FontPreview heading={fields.headingFont || recommended.headingFont} body={fields.bodyFont || recommended.bodyFont} />
      {fonts.length > 0 && <p className="text-xs text-zinc-500">Font di website: {fonts.join(', ')}.</p>}
    </div>
  )
}

function AccountKindField({ value, onChange }: { value: string; onChange: (value: AccountKind | '') => void }) {
  return (
    <label className={LABEL}>
      <span>{FIELD_LABELS.accountKind}</span>
      <select
        value={value}
        onChange={(event) => onChange(isAccountKind(event.target.value) ? event.target.value : '')}
        className={FIELD}
      >
        <option value="">Belum dipilih</option>
        {(Object.keys(ACCOUNT_KINDS) as AccountKind[]).map((kind) => (
          <option key={kind} value={kind}>
            {ACCOUNT_KINDS[kind].label}
          </option>
        ))}
      </select>
    </label>
  )
}

const primaryPalette = (colors: BrandColor[]) => {
  const hex = colors.find((color) => color.role === 'utama')?.hex
  return hex ? { accent: hex } : undefined
}

interface VisualStyleFieldProps {
  value: string
  suggested: boolean
  onChange: (value: string) => void
  onAnalyzed: (visualStyle: string, colors: string[]) => void
  referenceCount: number
}

function VisualStyleField({ value, suggested, onChange, onAnalyzed, referenceCount }: VisualStyleFieldProps) {
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [summary, setSummary] = useState<string | null>(null)

  async function analyze() {
    setPending(true)
    setError(null)
    setSummary(null)
    const response: VisualResult = await analyzeVisualAction().catch(() => ({ error: FAILED }))
    setPending(false)
    if ('error' in response) {
      setError(response.error)
      return
    }
    onAnalyzed(response.visualStyle, response.colors)
    const skipped =
      response.skipped > 0
        ? ` ${response.skipped} referensi lain dilewati karena permintaan ke 9Router dibatasi 1 MB.`
        : ''
    setSummary(
      referenceCount === 0
        ? `Dianalisis dari ${response.used} logo atau gambar website aktif.${skipped}`
        : `Dianalisis dari ${response.used} referensi; deskripsinya tersimpan di kartu referensi.${skipped}`,
    )
  }

  return (
    <div className="space-y-2">
      <TextField
        field="visualStyle"
        value={value}
        suggested={suggested}
        onChange={onChange}
        rows={5}
        placeholder="Komposisi, mood, tipografi, jenis foto, elemen grafis yang khas."
      />
      <button type="button" onClick={analyze} disabled={pending} className={BUTTON}>
        <Sparkles size={16} aria-hidden="true" />
        {pending
          ? 'AI sedang melihat referensi…'
          : referenceCount === 0
            ? 'Analisis visual dari logo atau Aset website'
            : `Analisis visual (sampai ${referenceCount} referensi terbaru)`}
      </button>
      {summary && <p className="text-xs text-zinc-500">{summary}</p>}
      {error && <Notice tone="error">{error}</Notice>}
    </div>
  )
}
