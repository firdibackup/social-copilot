'use client'

import { ArrowLeft, ArrowRight, Check } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useRef, useState, type FormEvent, type KeyboardEvent, type ReactNode } from 'react'
import { DesignStylePicker, FontPreview, FontSelect } from '@/components/design-style-picker'
import { CarouselyLogo } from '@/components/brand-mark'
import { Notice } from '@/components/notice'
import { BRAND_TEXT_LIMITS, normalizeHex, type BrandColor } from '@/lib/brand-options'
import {
  ACCOUNT_KINDS,
  DEFAULT_BODY_FONT,
  DEFAULT_HEADING_FONT,
  DESIGN_STYLES,
  designStyleOf,
  type AccountKind,
} from '@/lib/design-styles'
import type { OnboardingAnswers } from '@/lib/onboarding-options'
import { saveOnboardingAction } from './actions'

const FAILED = 'Gagal menghubungi server. Coba lagi.'
const FIELD =
  'block w-full rounded-xl border border-hairline bg-white px-4 py-3 text-base text-ink placeholder:text-ink-soft focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent'
const PRIMARY =
  'inline-flex items-center gap-2 rounded-xl bg-ink px-5 py-3 text-sm font-medium text-white transition-colors hover:bg-zinc-800 disabled:opacity-50'
const GHOST =
  'inline-flex items-center gap-2 rounded-xl px-4 py-3 text-sm font-medium text-ink-muted transition-colors hover:bg-zinc-100 hover:text-ink disabled:opacity-50'

const SWATCHES = ['#0f766e', '#1d4ed8', '#7c3aed', '#db2777', '#dc2626', '#ea580c', '#ca8a04', '#15803d', '#18181b', '#a6834e']

type StepId = 'kind' | 'name' | 'description' | 'audience' | 'style' | 'fonts' | 'color' | 'done'

interface Step {
  id: StepId
  title: string
  hint: string
  /** Lanjut stays off until it is answered. */
  required?: (answers: OnboardingAnswers) => boolean
}

const STEPS: Step[] = [
  {
    id: 'kind',
    title: 'Akun Instagram ini untuk apa?',
    hint: 'Supaya gaya bahasa dan ide kontennya pas.',
    required: (answers) => answers.accountKind !== '',
  },
  {
    id: 'name',
    title: 'Apa nama brand dan bidang usahanya?',
    hint: 'Nama yang muncul di konten, dan bidangnya dalam beberapa kata.',
    required: (answers) => answers.name.trim() !== '',
  },
  {
    id: 'description',
    title: 'Ceritakan bisnismu secara singkat.',
    hint: 'Apa yang dijual atau ditawarkan, dan apa bedanya dengan yang lain. 2–3 kalimat sudah cukup.',
  },
  {
    id: 'audience',
    title: 'Siapa yang ingin kamu jangkau?',
    hint: 'Contoh: ibu muda 25–35 tahun di Jabodetabek yang suka masak praktis.',
  },
  {
    id: 'style',
    title: 'Gaya desain seperti apa yang kamu mau?',
    hint: 'Ini yang paling menentukan tampilan carousel. Cover, isi, dan CTA akan punya layout sendiri dalam gaya yang sama.',
    required: (answers) => answers.designStyle !== '',
  },
  {
    id: 'fonts',
    title: 'Pilih font untuk desainmu.',
    hint: 'Sudah kami sarankan sesuai gaya yang dipilih. Ganti kalau punya font brand sendiri.',
  },
  {
    id: 'color',
    title: 'Warna utama brand?',
    hint: 'Opsional. Kalau dilewati, warna diambil dari post Instagram-mu nanti.',
  },
  {
    id: 'done',
    title: 'Siap! Ini gaya brand-mu.',
    hint: 'Semua bisa diubah kapan saja di halaman Brand.',
  },
]

const primaryColor = (colors: BrandColor[]) => colors.find((color) => color.role === 'utama')?.hex ?? ''

function withPrimary(colors: BrandColor[], hex: string): BrandColor[] {
  const rest = colors.filter((color) => color.role !== 'utama')
  return hex ? [{ hex, role: 'utama' }, ...rest] : rest
}

export function Wizard({ initial }: { initial: OnboardingAnswers }) {
  const router = useRouter()
  const [answers, setAnswers] = useState<OnboardingAnswers>(initial)
  const [index, setIndex] = useState(0)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [hexInput, setHexInput] = useState(primaryColor(initial.colors))
  const heading = useRef<HTMLHeadingElement>(null)

  const step = STEPS[index]
  const last = index === STEPS.length - 1
  const answered = step.required ? step.required(answers) : true
  const style = designStyleOf(answers.designStyle)

  function update<K extends keyof OnboardingAnswers>(field: K, value: OnboardingAnswers[K]) {
    setAnswers((previous) => ({ ...previous, [field]: value }))
    setError(null)
  }

  function go(next: number) {
    setIndex(next)
    setError(null)
    // The new question is announced and Enter keeps working from it.
    requestAnimationFrame(() => heading.current?.focus())
  }

  async function save(complete: boolean): Promise<string | null> {
    const result = await saveOnboardingAction(answers, complete).catch(() => ({ error: FAILED }))
    if ('error' in result) {
      setError(result.error)
      return null
    }
    return result.next
  }

  async function finish() {
    setPending(true)
    const next = await save(true)
    if (next) {
      router.push(next)
      return
    }
    setPending(false)
  }

  function forward(event?: FormEvent) {
    event?.preventDefault()
    if (pending || !answered) return
    if (last) {
      void finish()
      return
    }
    // Kept as the user goes, so a closed tab doesn't lose the answers; a failure here only matters at the end.
    void save(false)
    go(index + 1)
  }

  /** Cmd/Ctrl+Enter in a textarea moves on; plain Enter makes a new line. */
  function textareaKeys(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) forward()
  }

  return (
    <div className="fixed inset-0 flex flex-col overflow-y-auto bg-bg">
      <header className="sticky top-0 z-10 border-b border-hairline bg-bg/90 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-5xl items-center justify-between gap-4 px-5">
          <CarouselyLogo />
          <button type="button" onClick={finish} disabled={pending} className="text-sm text-ink-muted hover:text-ink">
            Lewati, isi nanti
          </button>
        </div>
        <div
          className="h-0.5 bg-hairline"
          role="progressbar"
          aria-label="Kemajuan"
          aria-valuemin={1}
          aria-valuemax={STEPS.length}
          aria-valuenow={index + 1}
        >
          <div className="h-full bg-accent transition-[width] duration-300" style={{ width: `${((index + 1) / STEPS.length) * 100}%` }} />
        </div>
      </header>

      <form onSubmit={forward} className="flex flex-1 flex-col">
        <div
          key={step.id}
          className={`mx-auto w-full flex-1 animate-fade-in px-5 py-10 sm:py-16 ${step.id === 'style' ? 'max-w-5xl' : 'max-w-2xl'}`}
        >
          <p className="text-sm font-medium text-accent">
            {index + 1} / {STEPS.length}
          </p>
          <h1 ref={heading} tabIndex={-1} className="mt-2 text-2xl font-semibold tracking-tight text-ink outline-none sm:text-3xl">
            {step.title}
          </h1>
          <p className="mt-2 text-ink-muted">{step.hint}</p>

          <div className="mt-8">
            <StepBody
              id={step.id}
              answers={answers}
              update={update}
              textareaKeys={textareaKeys}
              hexInput={hexInput}
              setHexInput={setHexInput}
            />
          </div>

          {error && (
            <div className="mt-6">
              <Notice tone="error">{error}</Notice>
            </div>
          )}
        </div>

        <footer className="sticky bottom-0 border-t border-hairline bg-bg/90 backdrop-blur">
          <div className="mx-auto flex max-w-5xl items-center justify-between gap-3 px-5 py-3">
            <button type="button" onClick={() => go(index - 1)} disabled={index === 0 || pending} className={GHOST}>
              <ArrowLeft size={16} aria-hidden="true" />
              Kembali
            </button>
            <div className="flex items-center gap-3">
              {!step.required && !last && (
                <button type="button" onClick={() => go(index + 1)} className={GHOST}>
                  Lewati
                </button>
              )}
              <button type="submit" disabled={!answered || pending} className={PRIMARY}>
                {last ? (pending ? 'Menyimpan…' : 'Simpan & hubungkan Instagram') : 'Lanjut'}
                {last ? <Check size={16} aria-hidden="true" /> : <ArrowRight size={16} aria-hidden="true" />}
              </button>
            </div>
          </div>
          {style && step.id === 'style' && (
            <p className="sr-only" aria-live="polite">
              Dipilih: {style.label}
            </p>
          )}
        </footer>
      </form>
    </div>
  )
}

interface StepBodyProps {
  id: StepId
  answers: OnboardingAnswers
  update: <K extends keyof OnboardingAnswers>(field: K, value: OnboardingAnswers[K]) => void
  textareaKeys: (event: KeyboardEvent<HTMLTextAreaElement>) => void
  hexInput: string
  setHexInput: (value: string) => void
}

function StepBody({ id, answers, update, textareaKeys, hexInput, setHexInput }: StepBodyProps) {
  const style = designStyleOf(answers.designStyle)
  const primary = primaryColor(answers.colors)

  switch (id) {
    case 'kind':
      return (
        <div role="radiogroup" aria-label="Jenis akun" className="grid gap-3 sm:grid-cols-2">
          {(Object.entries(ACCOUNT_KINDS) as [AccountKind, (typeof ACCOUNT_KINDS)[AccountKind]][]).map(([kind, option]) => (
            <Choice
              key={kind}
              selected={answers.accountKind === kind}
              onSelect={() => update('accountKind', kind)}
              title={option.label}
              hint={option.hint}
            />
          ))}
        </div>
      )
    case 'name':
      return (
        <div className="space-y-4">
          <label className="block space-y-1.5">
            <span className="text-sm font-medium text-ink">Nama brand</span>
            <input
              autoFocus
              value={answers.name}
              onChange={(event) => update('name', event.target.value)}
              maxLength={BRAND_TEXT_LIMITS.name}
              placeholder="mis. Kopi Sinar"
              className={FIELD}
            />
          </label>
          <label className="block space-y-1.5">
            <span className="text-sm font-medium text-ink">Bidang usaha</span>
            <input
              value={answers.category}
              onChange={(event) => update('category', event.target.value)}
              maxLength={BRAND_TEXT_LIMITS.category}
              placeholder="mis. Kedai kopi, skincare lokal, kursus bahasa Inggris"
              className={FIELD}
            />
          </label>
        </div>
      )
    case 'description':
      return (
        <TextArea
          label="Deskripsi bisnis"
          value={answers.description}
          onChange={(value) => update('description', value)}
          max={BRAND_TEXT_LIMITS.description}
          placeholder="mis. Kedai kopi susu gula aren di Bandung. Biji kopi dari petani Garut, harga mahasiswa, buka sampai malam."
          onKeyDown={textareaKeys}
        />
      )
    case 'audience':
      return (
        <TextArea
          label="Target audiens"
          value={answers.audience}
          onChange={(value) => update('audience', value)}
          max={BRAND_TEXT_LIMITS.audience}
          placeholder="mis. Mahasiswa dan pekerja muda 18–30 tahun di Bandung."
          onKeyDown={textareaKeys}
          rows={3}
        />
      )
    case 'style':
      return (
        <DesignStylePicker
          large
          value={answers.designStyle}
          onChange={(next) => update('designStyle', next)}
          palette={primary ? { accent: primary } : undefined}
        />
      )
    case 'fonts': {
      const heading = answers.headingFont || style?.headingFont || DEFAULT_HEADING_FONT
      const body = answers.bodyFont || style?.bodyFont || DEFAULT_BODY_FONT
      return (
        <div className="space-y-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <FontSelect
              label="Font judul"
              value={answers.headingFont}
              onChange={(value) => update('headingFont', value)}
              recommended={style?.headingFont ?? DEFAULT_HEADING_FONT}
            />
            <FontSelect
              label="Font isi"
              value={answers.bodyFont}
              onChange={(value) => update('bodyFont', value)}
              recommended={style?.bodyFont ?? DEFAULT_BODY_FONT}
            />
          </div>
          <FontPreview heading={heading} body={body} />
        </div>
      )
    }
    case 'color':
      return (
        <div className="space-y-5">
          <div className="flex flex-wrap gap-3" role="radiogroup" aria-label="Warna utama">
            {SWATCHES.map((hex) => (
              <button
                key={hex}
                type="button"
                role="radio"
                aria-checked={primary === hex}
                aria-label={hex}
                onClick={() => {
                  update('colors', withPrimary(answers.colors, primary === hex ? '' : hex))
                  setHexInput(primary === hex ? '' : hex)
                }}
                className={`size-11 rounded-full border-2 transition-transform hover:scale-105 ${
                  primary === hex ? 'border-ink ring-2 ring-white ring-inset' : 'border-transparent'
                }`}
                style={{ background: hex }}
              />
            ))}
          </div>
          <label className="block max-w-xs space-y-1.5">
            <span className="text-sm font-medium text-ink">Atau kode warna sendiri</span>
            <div className="flex items-center gap-2">
              <span className="size-11 shrink-0 rounded-xl border border-hairline" style={{ background: primary || 'transparent' }} />
              <input
                value={hexInput}
                onChange={(event) => {
                  setHexInput(event.target.value)
                  const hex = normalizeHex(event.target.value)
                  if (hex || event.target.value.trim() === '') update('colors', withPrimary(answers.colors, hex ?? ''))
                }}
                placeholder="#0f766e"
                maxLength={7}
                className={FIELD}
              />
            </div>
          </label>
        </div>
      )
    case 'done':
      return <Summary answers={answers} />
  }
}

function Summary({ answers }: { answers: OnboardingAnswers }) {
  const style = designStyleOf(answers.designStyle) ?? DESIGN_STYLES.minimalis
  const rows: [string, ReactNode][] = [
    ['Jenis akun', answers.accountKind ? ACCOUNT_KINDS[answers.accountKind].label : '—'],
    ['Brand', [answers.name, answers.category].filter(Boolean).join(' · ') || '—'],
    ['Gaya desain', style.label],
    ['Font', `${answers.headingFont || style.headingFont} · ${answers.bodyFont || style.bodyFont}`],
    [
      'Warna utama',
      primaryColor(answers.colors) ? (
        <span className="inline-flex items-center gap-2">
          <span className="size-4 rounded-full border border-hairline" style={{ background: primaryColor(answers.colors) }} />
          {primaryColor(answers.colors)}
        </span>
      ) : (
        'Dari post Instagram'
      ),
    ],
  ]
  return (
    <div className="space-y-6">
      <dl className="divide-y divide-hairline rounded-xl border border-hairline bg-white">
        {rows.map(([label, value]) => (
          <div key={label} className="flex items-center justify-between gap-4 px-5 py-3 text-sm">
            <dt className="text-ink-muted">{label}</dt>
            <dd className="text-right font-medium text-ink">{value}</dd>
          </div>
        ))}
      </dl>
      <p className="text-sm leading-relaxed text-ink-muted">
        Berikutnya hubungkan Instagram. Kami ambil logo dan beberapa post sebagai contoh layout. Gaya{' '}
        <span className="font-medium text-ink">{style.label}</span> tetap menentukan font dan kesan desainnya, sedangkan
        post-mu jadi acuan susunan layout.
      </p>
    </div>
  )
}

function Choice({ selected, onSelect, title, hint }: { selected: boolean; onSelect: () => void; title: string; hint: string }) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      onClick={onSelect}
      className={`flex items-start justify-between gap-3 rounded-xl border bg-white p-4 text-left transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ${
        selected ? 'border-accent ring-1 ring-accent' : 'border-hairline hover:border-zinc-300'
      }`}
    >
      <span className="space-y-0.5">
        <span className="block font-medium text-ink">{title}</span>
        <span className="block text-sm text-ink-muted">{hint}</span>
      </span>
      {selected && <Check size={18} className="mt-0.5 shrink-0 text-accent" aria-hidden="true" />}
    </button>
  )
}

interface TextAreaProps {
  label: string
  value: string
  onChange: (value: string) => void
  max: number
  placeholder: string
  onKeyDown: (event: KeyboardEvent<HTMLTextAreaElement>) => void
  rows?: number
}

function TextArea({ label, value, onChange, max, placeholder, onKeyDown, rows = 4 }: TextAreaProps) {
  return (
    <label className="block space-y-1.5">
      <span className="text-sm font-medium text-ink">{label}</span>
      <textarea
        autoFocus
        value={value}
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={onKeyDown}
        maxLength={max}
        rows={rows}
        placeholder={placeholder}
        className={`${FIELD} resize-none`}
      />
      <span className="flex justify-between text-xs text-ink-soft">
        <span>Ctrl/⌘ + Enter untuk lanjut</span>
        <span>
          {Array.from(value).length}/{max}
        </span>
      </span>
    </label>
  )
}
