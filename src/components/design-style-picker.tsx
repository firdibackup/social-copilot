'use client'

import { useTranslations } from 'next-intl'
import Image from 'next/image'
import { useState } from 'react'
import { Check, ChevronLeft, ChevronRight } from 'lucide-react'
import { DESIGN_STYLE_IDS, DESIGN_STYLES, FONT_CHOICES, type DesignStyleId, type FontName } from '@/lib/design-styles'
import { FONT_FAMILY, fontFamilyOf } from './font-previews'

interface Palette {
  background: string
  ink: string
  accent: string
}

/** Three hardcoded examples make the layout choice visible without spending an image generation request. */
function MiniCarousel({ id, palette }: { id: DesignStyleId; palette: Palette }) {
  const t = useTranslations('common')
  const [index, setIndex] = useState(0)
  const style = DESIGN_STYLES[id]
  const sample = style.samples[index]
  const heading = { fontFamily: FONT_FAMILY[style.headingFont], color: palette.ink }
  const body = { fontFamily: FONT_FAMILY[style.bodyFont], color: palette.ink }
  const roleName = t(`design.roles.${sample.role}`)

  function move(event: React.MouseEvent, direction: number) {
    event.stopPropagation()
    setIndex((current) => (current + direction + style.samples.length) % style.samples.length)
  }

  return (
    <div>
      <div
        className="relative mx-auto aspect-[4/5] w-full max-w-52 overflow-hidden rounded-lg border border-black/5 shadow-sm"
        style={{ background: palette.background }}
      >
        <Image src={sample.image} alt="" fill sizes="208px" className="object-cover" />
        <div className={`absolute inset-0 bg-gradient-to-b ${id === 'tech' ? 'from-black/75 via-black/25' : 'from-white/65 via-white/25'} to-transparent`} aria-hidden="true" />
        <div className={`absolute inset-0 flex p-5 ${sample.role === 'cta' ? 'items-center text-center' : 'flex-col'}`}>
          <div className={sample.role === 'cta' ? 'w-full' : ''}>
            <p className="mb-3 text-[8px] font-bold uppercase tracking-[0.18em]" style={{ ...body, color: palette.accent }}>
              {t(`design.styles.${id}.samples.${sample.role}.label`)}
            </p>
            <p className={`font-bold leading-[0.98] ${sample.role === 'cover' ? 'text-[22px]' : 'text-[18px]'}`} style={heading}>
              {t(`design.styles.${id}.samples.${sample.role}.title`)}
            </p>
            <p className="mt-3 text-[9px] leading-snug opacity-75" style={body}>
              {t(`design.styles.${id}.samples.${sample.role}.copy`)}
            </p>
            {sample.role === 'cta' && (
              <span className="mt-4 inline-block rounded-full px-3 py-1.5 text-[8px] font-bold" style={{ background: palette.accent, color: palette.background }}>
                {t('design.more')}
              </span>
            )}
          </div>
        </div>
        <span className="absolute bottom-3 right-3 rounded-full bg-black/10 px-2 py-0.5 text-[8px] font-semibold" style={body}>
          {roleName} · {index + 1}/3
        </span>
        <button type="button" aria-label={t('design.previous', { style: t(`design.styles.${id}.label`) })} onClick={(event) => move(event, -1)} className="absolute left-2 top-1/2 rounded-full bg-white/80 p-1 text-zinc-700 shadow-sm opacity-0 transition-opacity group-hover:opacity-100 focus:opacity-100">
          <ChevronLeft size={13} aria-hidden="true" />
        </button>
        <button type="button" aria-label={t('design.next', { style: t(`design.styles.${id}.label`) })} onClick={(event) => move(event, 1)} className="absolute right-2 top-1/2 rounded-full bg-white/80 p-1 text-zinc-700 shadow-sm opacity-0 transition-opacity group-hover:opacity-100 focus:opacity-100">
          <ChevronRight size={13} aria-hidden="true" />
        </button>
      </div>
      <div className="mt-2 flex justify-center gap-1" aria-hidden="true">
        {style.samples.map((item, itemIndex) => (
          <span key={item.role} className="h-1 rounded-full transition-all" style={{ width: itemIndex === index ? 18 : 5, background: itemIndex === index ? palette.accent : `${palette.ink}30` }} />
        ))}
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
  const t = useTranslations('common')
  return (
    <div role="radiogroup" aria-label={t('design.title')} className={`grid gap-3 ${large ? 'sm:grid-cols-2 lg:grid-cols-4' : 'sm:grid-cols-2'}`}>
      {DESIGN_STYLE_IDS.map((id) => {
        const style = DESIGN_STYLES[id]
        const selected = value === id
        return (
          <div
            key={id}
            className={`group relative space-y-3 rounded-xl border bg-white p-3 text-left transition-colors ${
              selected ? 'border-accent ring-1 ring-accent' : 'border-hairline hover:border-zinc-300'
            }`}
          >
            <MiniCarousel id={id} palette={{ ...style.preview, ...palette }} />
            <label className="block cursor-pointer space-y-0.5 rounded-md focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-accent">
              <input
                type="radio"
                name="design-style"
                value={id}
                checked={selected}
                onChange={() => onChange(id)}
                className="sr-only"
              />
              <span className="flex items-center justify-between gap-2 text-sm font-semibold text-ink">
                {t(`design.styles.${id}.label`)}
                {selected && <Check size={16} className="text-accent" aria-hidden="true" />}
              </span>
              <span className="block text-xs leading-relaxed text-ink-muted">{t(`design.styles.${id}.summary`)}</span>
              {large && <span className="block text-xs leading-relaxed text-ink-soft">{t('design.suits', { suits: t(`design.styles.${id}.suits`) })}</span>}
            </label>
          </div>
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
  const t = useTranslations('common')
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
        <option value="">{recommended ? t('design.follow', { font: recommended }) : t('design.auto')}</option>
        {(['sans', 'serif'] as const).map((kind) => (
          <optgroup key={kind} label={kind === 'sans' ? 'Sans serif' : 'Serif'}>
            {FONT_CHOICES.filter((font) => font.kind === kind).map((font) => (
              <option key={font.name} value={font.name} style={{ fontFamily: FONT_FAMILY[font.name] }}>
                {font.name} — {t(`design.fonts.${font.name}`)}{font.name === recommended ? t('design.recommended') : ''}
              </option>
            ))}
          </optgroup>
        ))}
        {others.length > 0 && (
          <optgroup label={t('design.other')}>
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
  const t = useTranslations('common')
  return (
    <div className="space-y-1 rounded-xl border border-hairline bg-white p-5">
      <p className="text-2xl font-bold leading-tight text-ink" style={{ fontFamily: fontFamilyOf(heading) }}>
        {t('design.previewHeading')}
      </p>
      <p className="text-sm leading-relaxed text-ink-muted" style={{ fontFamily: fontFamilyOf(body) }}>
        {t('design.previewBody')}
      </p>
      <p className="pt-1 text-xs text-ink-soft">
        {heading} · {body}
      </p>
    </div>
  )
}
