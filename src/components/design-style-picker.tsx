'use client'

import { Check } from 'lucide-react'
import { DESIGN_STYLE_IDS, DESIGN_STYLES, FONT_CHOICES, type DesignStyleId, type FontName } from '@/lib/design-styles'
import { FONT_FAMILY, fontFamilyOf } from './font-previews'

interface Palette {
  background: string
  ink: string
  accent: string
}

/** A tiny cover and inner slide in the style, so the owner sees the difference instead of reading it. */
function MiniCarousel({ id, palette }: { id: DesignStyleId; palette: Palette }) {
  const style = DESIGN_STYLES[id]
  const heading = { fontFamily: FONT_FAMILY[style.headingFont], color: palette.ink }
  const body = { fontFamily: FONT_FAMILY[style.bodyFont], color: palette.ink }
  const slide = 'relative aspect-[4/5] flex-1 overflow-hidden rounded-md border border-black/5'
  return (
    <div className="flex gap-1.5" aria-hidden="true">
      <div className={slide} style={{ background: palette.background }}>
        <span className="absolute left-2 top-2 h-1 w-4 rounded-full" style={{ background: palette.accent }} />
        <p className="absolute inset-x-2 top-1/3 text-[13px] font-bold leading-tight" style={heading}>
          5 Cara Mulai
        </p>
        <span className="absolute bottom-2 right-2 text-[9px]" style={{ ...body, color: palette.accent }}>
          geser →
        </span>
      </div>
      <div className={slide} style={{ background: palette.background }}>
        <span className="absolute left-2 top-2 text-[9px] font-bold" style={{ ...heading, color: palette.accent }}>
          01
        </span>
        <p className="absolute inset-x-2 top-6 text-[10px] font-bold leading-tight" style={heading}>
          Kenali audiens
        </p>
        <div className="absolute inset-x-2 top-11 space-y-1">
          {[100, 85, 92].map((width) => (
            <span
              key={width}
              className="block h-[3px] rounded-full opacity-40"
              style={{ width: `${width}%`, background: palette.ink }}
            />
          ))}
        </div>
      </div>
    </div>
  )
}

interface DesignStylePickerProps {
  value: string
  onChange: (id: DesignStyleId) => void
  /** The brand's colours, when it has some: the previews use them instead of the style's own. */
  palette?: Partial<Palette>
  /** Bigger cards for the full-screen wizard. */
  large?: boolean
}

export function DesignStylePicker({ value, onChange, palette, large = false }: DesignStylePickerProps) {
  return (
    <div role="radiogroup" aria-label="Gaya desain" className={`grid gap-3 ${large ? 'sm:grid-cols-2 lg:grid-cols-4' : 'sm:grid-cols-2'}`}>
      {DESIGN_STYLE_IDS.map((id) => {
        const style = DESIGN_STYLES[id]
        const selected = value === id
        return (
          <button
            key={id}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={() => onChange(id)}
            className={`group relative space-y-3 rounded-xl border bg-white p-3 text-left transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ${
              selected ? 'border-accent ring-1 ring-accent' : 'border-hairline hover:border-zinc-300'
            }`}
          >
            <MiniCarousel id={id} palette={{ ...style.preview, ...palette }} />
            <div className="space-y-0.5">
              <p className="flex items-center justify-between gap-2 text-sm font-semibold text-ink">
                {style.label}
                {selected && <Check size={16} className="text-accent" aria-hidden="true" />}
              </p>
              <p className="text-xs leading-relaxed text-ink-muted">{style.summary}</p>
              {large && <p className="text-xs leading-relaxed text-ink-soft">Cocok: {style.suits}</p>}
            </div>
          </button>
        )
      })}
    </div>
  )
}

interface FontSelectProps {
  label: string
  value: string
  onChange: (value: string) => void
  /** The style's font, shown first as the recommendation. */
  recommended?: FontName
  /** Other fonts worth offering, such as the ones found on the brand's website. */
  extra?: string[]
  className?: string
}

/** A font from the choices, each in its own face; one typed elsewhere stays selectable as it is. */
export function FontSelect({ label, value, onChange, recommended, extra = [], className = '' }: FontSelectProps) {
  const others = [...new Set([...extra, value])].filter((font) => font !== '' && fontFamilyOf(font) === undefined)
  return (
    <label className="block space-y-1 text-sm font-medium text-zinc-900">
      <span>{label}</span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        style={{ fontFamily: fontFamilyOf(value) }}
        className={`block w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm font-normal text-zinc-900 focus:border-zinc-400 focus:outline-none ${className}`}
      >
        <option value="">{recommended ? `Ikuti gaya (${recommended})` : 'Otomatis'}</option>
        {(['sans', 'serif'] as const).map((kind) => (
          <optgroup key={kind} label={kind === 'sans' ? 'Sans serif' : 'Serif'}>
            {FONT_CHOICES.filter((font) => font.kind === kind).map((font) => (
              <option key={font.name} value={font.name} style={{ fontFamily: FONT_FAMILY[font.name] }}>
                {font.name} — {font.use}{font.name === recommended ? ' (disarankan)' : ''}
              </option>
            ))}
          </optgroup>
        ))}
        {others.length > 0 && (
          <optgroup label="Lainnya">
            {others.map((font) => (
              <option key={font} value={font}>
                {font}
              </option>
            ))}
          </optgroup>
        )}
      </select>
    </label>
  )
}

/** The heading over a line of body text, in the two fonts. */
export function FontPreview({ heading, body }: { heading: string; body: string }) {
  return (
    <div className="space-y-1 rounded-xl border border-hairline bg-white p-5">
      <p className="text-2xl font-bold leading-tight text-ink" style={{ fontFamily: fontFamilyOf(heading) }}>
        Konten yang bikin berhenti scroll
      </p>
      <p className="text-sm leading-relaxed text-ink-muted" style={{ fontFamily: fontFamilyOf(body) }}>
        Ini contoh teks isi slide: jelas, rapi, dan enak dibaca di layar HP.
      </p>
      <p className="pt-1 text-xs text-ink-soft">
        {heading} · {body}
      </p>
    </div>
  )
}
