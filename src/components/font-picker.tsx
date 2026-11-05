'use client'

import { useTranslations } from 'next-intl'
import { Check, ChevronsUpDown, Search, X } from 'lucide-react'
import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent, type ReactNode, type RefObject } from 'react'
import { FONT_CHOICES, isCuratedFont, type CuratedFontName } from '@/lib/design-styles'
import { loadFontPreview, useFont } from '@/lib/font-loader'
import { googleFontOf, searchFonts, type FontCategory } from '@/lib/google-fonts'
import { fontFamilyOf } from './font-previews'

type Category = 'all' | FontCategory
const CATEGORIES: readonly Category[] = ['all', 'sans', 'serif', 'display', 'handwriting', 'mono']

/** Row heights, fixed so the list can be windowed: only the rows in view are drawn (and their fonts fetched). */
const HEADER_H = 32
const ROW_H = 44
const TALL_H = 56
const OVERSCAN = 240
/** The search field and the category chips above the list, for placing the panel. */
const CHROME_H = 104

type Section = 'empty' | 'curated' | 'other' | 'catalog'
type Item =
  | { kind: 'header'; key: string; label: string; count?: number }
  | { kind: 'option'; key: string; name: string; section: Section; category?: FontCategory }

interface Place {
  mobile: boolean
  left?: number
  width?: number
  top?: number
  bottom?: number
  listHeight: number
}

/** Stable, so the item list isn't rebuilt on every scroll. */
const NO_FONTS: readonly string[] = []
const matches = (name: string, query: string) => name.toLowerCase().includes(query)
const heightOf = (item: Item) => (item.kind === 'header' ? HEADER_H : item.section === 'curated' ? TALL_H : ROW_H)

function computePlace(trigger: HTMLElement): Place {
  const vw = window.innerWidth
  const vh = window.innerHeight
  if (window.matchMedia('(max-width: 639.98px)').matches) {
    return { mobile: true, listHeight: Math.round(Math.max(200, Math.min(vh * 0.82 - 150, 560))) }
  }
  const rect = trigger.getBoundingClientRect()
  const width = Math.min(Math.max(rect.width, 340), vw - 16)
  const left = Math.min(Math.max(8, rect.left), vw - width - 8)
  const below = vh - rect.bottom - 14
  const above = rect.top - 14
  const up = below < 320 && above > below
  const listHeight = Math.round(Math.max(140, Math.min(340, (up ? above : below) - CHROME_H)))
  return up ? { mobile: false, left, width, bottom: vh - rect.top + 6, listHeight } : { mobile: false, left, width, top: rect.bottom + 6, listHeight }
}

interface FontPickerProps {
  /** The visible field label. */
  label: ReactNode
  labelClassName?: string
  /** A font name, or '' for the empty choice when emptyLabel is set. */
  value: string
  onChange: (value: string) => void
  /** Offers '' as the first choice, with this text ("Ikuti gaya (Poppins)"). */
  emptyLabel?: string
  /** Marked as the style's pick; also the face the empty choice is shown in. */
  recommended?: string
  /** Fonts worth offering first (found on the brand's website), listed under "Lainnya". */
  extra?: readonly string[]
  /** The trigger's look; the picker adds its own layout and focus ring. */
  className?: string
  id?: string
  disabled?: boolean
}

/**
 * A font choice from the whole Google Fonts catalogue: the 20 curated ones first, then a searchable, windowed list
 * where every row is drawn in its own face. Each row only fetches the glyphs of its own name, and only once on screen.
 */
export function FontPicker({
  label,
  labelClassName = 'mb-1 block text-sm font-medium text-ink',
  value,
  onChange,
  emptyLabel,
  recommended,
  extra = NO_FONTS,
  className = '',
  id,
  disabled = false,
}: FontPickerProps) {
  const t = useTranslations('common')
  const autoId = useId()
  const triggerId = id ?? `${autoId}-trigger`
  const labelId = `${autoId}-label`
  const valueId = `${autoId}-value`
  const trigger = useRef<HTMLButtonElement>(null)
  const panel = useRef<HTMLDivElement>(null)
  const [place, setPlace] = useState<Place | null>(null)

  const shown = value || recommended || ''
  useFont(shown || undefined)

  function open() {
    if (trigger.current) setPlace(computePlace(trigger.current))
  }

  function close(refocus: boolean) {
    setPlace(null)
    if (refocus) trigger.current?.focus({ preventScroll: true })
  }

  // Keep the panel stuck to its trigger while the page scrolls or resizes.
  const isOpen = place !== null
  useEffect(() => {
    if (!isOpen) return
    const follow = (event: Event) => {
      if (event.target instanceof Node && panel.current?.contains(event.target)) return
      if (trigger.current) setPlace(computePlace(trigger.current))
    }
    window.addEventListener('scroll', follow, true)
    window.addEventListener('resize', follow)
    return () => {
      window.removeEventListener('scroll', follow, true)
      window.removeEventListener('resize', follow)
    }
  }, [isOpen])

  return (
    <div className="min-w-0">
      <label id={labelId} htmlFor={triggerId} className={labelClassName}>
        {label}
      </label>
      <button
        ref={trigger}
        id={triggerId}
        type="button"
        disabled={disabled}
        aria-haspopup="dialog"
        aria-expanded={isOpen}
        aria-labelledby={`${labelId} ${valueId}`}
        onClick={() => (isOpen ? close(false) : open())}
        className={`flex w-full min-w-0 items-center gap-2 text-left transition-[border-color,box-shadow] focus-visible:border-accent focus-visible:shadow-[0_0_0_3px_color-mix(in_srgb,var(--color-focus)_45%,transparent)] focus-visible:outline-none aria-expanded:border-accent aria-expanded:shadow-[0_0_0_3px_color-mix(in_srgb,var(--color-focus)_45%,transparent)] ${className}`}
      >
        <span
          id={valueId}
          className={`min-w-0 flex-1 truncate ${value ? '' : 'text-ink-muted'}`}
          style={{ fontFamily: shown ? fontFamilyOf(shown) : undefined }}
        >
          {value || emptyLabel || t('design.picker.choose')}
        </span>
        <ChevronsUpDown size={15} aria-hidden="true" className="shrink-0 text-ink-soft" />
      </button>
      {place && (
        <FontPanel
          panelRef={panel}
          triggerRef={trigger}
          place={place}
          label={label}
          value={value}
          emptyLabel={emptyLabel}
          recommended={recommended}
          extra={extra}
          onSelect={(name) => {
            close(true)
            if (name !== value) onChange(name)
          }}
          onClose={close}
        />
      )}
    </div>
  )
}

interface FontPanelProps {
  panelRef: RefObject<HTMLDivElement | null>
  triggerRef: RefObject<HTMLButtonElement | null>
  place: Place
  label: ReactNode
  value: string
  emptyLabel?: string
  recommended?: string
  extra: readonly string[]
  onSelect: (name: string) => void
  onClose: (refocus: boolean) => void
}

function FontPanel({ panelRef, triggerRef, place, label, value, emptyLabel, recommended, extra, onSelect, onClose }: FontPanelProps) {
  const t = useTranslations('common')
  const listId = useId()
  const input = useRef<HTMLInputElement>(null)
  const scroller = useRef<HTMLDivElement>(null)
  const [query, setQuery] = useState('')
  const [category, setCategory] = useState<Category>('all')

  const items = useMemo(
    () => buildItems({ query, category, value, extra, emptyLabel, t }),
    [query, category, value, extra, emptyLabel, t],
  )
  const layout = useMemo(() => measure(items), [items])
  const listHeight = Math.min(place.listHeight, Math.max(layout.total, 1))

  // Opens on the current font, centred in the list.
  const [active, setActive] = useState(() => Math.max(0, layout.options.findIndex((i) => (items[i] as { name: string }).name === value)))
  const [scrollTop, setScrollTop] = useState(() => {
    const item = layout.options[active]
    return item === undefined ? 0 : Math.max(0, layout.offsets[item] - place.listHeight / 2 + ROW_H / 2)
  })

  useLayoutEffect(() => {
    const node = panelRef.current
    if (!node) return
    if (!node.matches(':popover-open')) node.showPopover()
    if (scroller.current) scroller.current.scrollTop = scrollTop
    // A keyboard on a phone would cover the list: there, focus the panel and leave the search to a tap.
    if (window.matchMedia('(pointer: fine)').matches) input.current?.focus({ preventScroll: true })
    else node.focus({ preventScroll: true })
    // Only on mount: scrollTop is the initial position here.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // A press anywhere outside the panel and its trigger closes it.
  useEffect(() => {
    const away = (event: PointerEvent) => {
      const node = panelRef.current
      const target = event.target instanceof Node ? event.target : null
      if (target && triggerRef.current?.contains(target)) return
      if (node && target && node.contains(target)) {
        // The popover's own ::backdrop counts as the element itself.
        const rect = node.getBoundingClientRect()
        const inside = event.clientX >= rect.left && event.clientX <= rect.right && event.clientY >= rect.top && event.clientY <= rect.bottom
        if (inside) return
      }
      onClose(false)
    }
    document.addEventListener('pointerdown', away, true)
    return () => document.removeEventListener('pointerdown', away, true)
  }, [panelRef, triggerRef, onClose])

  // The visible window of rows.
  const start = firstAt(layout.offsets, scrollTop - OVERSCAN)
  let end = start
  while (end < items.length && layout.offsets[end] < scrollTop + listHeight + OVERSCAN) end++

  // Fetch each visible row's face once scrolling settles, so a fling through the list doesn't fetch hundreds.
  useEffect(() => {
    const timer = window.setTimeout(() => {
      for (let i = start; i < end; i++) {
        const item = items[i]
        if (item.kind === 'option' && (item.section === 'catalog' || item.section === 'other')) loadFontPreview(item.name)
      }
    }, 90)
    return () => window.clearTimeout(timer)
  }, [start, end, items])

  function reveal(itemIndex: number) {
    const node = scroller.current
    if (!node) return
    const top = layout.offsets[itemIndex]
    const bottom = top + heightOf(items[itemIndex])
    // Show the section header above the first option of a section too.
    const above = itemIndex > 0 && items[itemIndex - 1].kind === 'header' ? HEADER_H : 0
    if (top - above < node.scrollTop) node.scrollTop = top - above
    else if (bottom > node.scrollTop + node.clientHeight) node.scrollTop = bottom - node.clientHeight
  }

  function moveTo(next: number) {
    if (layout.options.length === 0) return
    const clamped = Math.max(0, Math.min(layout.options.length - 1, next))
    setActive(clamped)
    reveal(layout.options[clamped])
  }

  function refilter(q: string, c: Category) {
    setQuery(q)
    setCategory(c)
    setActive(0)
    if (scroller.current) scroller.current.scrollTop = 0
    setScrollTop(0)
  }

  const activeItem = items[layout.options[active] ?? -1]
  const activeName = activeItem?.kind === 'option' ? activeItem.name : undefined
  const optionId = (ordinal: number) => `${listId}-o${ordinal}`

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    // Keys stay in the picker: the layer editor around it moves layers with the arrows.
    event.stopPropagation()
    const inField = event.target === input.current
    const onPanel = event.target === event.currentTarget
    const page = Math.max(1, Math.floor(listHeight / ROW_H) - 1)
    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault()
        moveTo(active + 1)
        break
      case 'ArrowUp':
        event.preventDefault()
        moveTo(active - 1)
        break
      case 'PageDown':
        event.preventDefault()
        moveTo(active + page)
        break
      case 'PageUp':
        event.preventDefault()
        moveTo(active - page)
        break
      case 'Home':
      case 'End':
        if (inField) break
        event.preventDefault()
        moveTo(event.key === 'Home' ? 0 : layout.options.length - 1)
        break
      case 'Enter':
        if (!(inField || onPanel)) break
        // Never submits the form around the picker, even with nothing to pick.
        event.preventDefault()
        if (activeName !== undefined) onSelect(activeName)
        break
      case 'Escape':
        event.preventDefault()
        onClose(true)
        break
    }
  }

  const style = place.mobile
    ? undefined
    : { left: place.left, width: place.width, top: place.top ?? 'auto', bottom: place.bottom ?? 'auto' }

  return (
    <div
      ref={panelRef}
      popover="manual"
      role="dialog"
      aria-label={typeof label === 'string' ? label : t('design.picker.choose')}
      tabIndex={-1}
      onKeyDown={onKeyDown}
      onBlur={(event) => {
        const next = event.relatedTarget
        if (next instanceof Node && !event.currentTarget.contains(next) && !triggerRef.current?.contains(next)) onClose(false)
      }}
      style={style}
      className={`m-0 flex flex-col overflow-hidden border border-hairline bg-white p-0 text-ink shadow-[0_24px_60px_-12px_rgb(20_21_31/0.28),0_2px_6px_rgb(20_21_31/0.06)] outline-none ${
        place.mobile
          ? 'inset-x-0 top-auto bottom-0 w-full max-w-none animate-fade-in rounded-t-2xl pb-[env(safe-area-inset-bottom)] backdrop:bg-[rgba(20,21,31,0.36)]'
          : 'fixed right-auto animate-modal-in rounded-xl'
      }`}
    >
      {place.mobile && (
        <div className="flex items-center gap-2 px-4 pt-2.5">
          <span aria-hidden="true" className="absolute left-1/2 top-1.5 h-1 w-9 -translate-x-1/2 rounded-full bg-zinc-200" />
          <p className="min-w-0 flex-1 truncate pt-2 text-sm font-semibold">{label}</p>
          <button
            type="button"
            onClick={() => onClose(true)}
            aria-label={t('design.picker.close')}
            className="-mr-2 mt-1 inline-flex size-9 items-center justify-center rounded-lg text-ink-muted hover:bg-zinc-100 hover:text-ink"
          >
            <X size={18} aria-hidden="true" />
          </button>
        </div>
      )}

      <div className="relative border-b border-hairline">
        <Search size={16} aria-hidden="true" className="pointer-events-none absolute top-1/2 left-3.5 -translate-y-1/2 text-ink-soft" />
        <input
          ref={input}
          type="text"
          role="combobox"
          aria-expanded="true"
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={activeName === undefined ? undefined : optionId(active)}
          aria-label={t('design.picker.search')}
          placeholder={t('design.picker.search')}
          autoComplete="off"
          autoCorrect="off"
          spellCheck={false}
          enterKeyHint="search"
          value={query}
          onChange={(event) => refilter(event.target.value, category)}
          className="border-0 h-12 w-full bg-transparent pr-10 pl-10 text-base text-ink placeholder:text-ink-soft focus:outline-none sm:h-11 sm:text-sm"
        />
        {query && (
          <button
            type="button"
            onClick={() => {
              refilter('', category)
              input.current?.focus()
            }}
            aria-label={t('design.picker.clear')}
            className="absolute top-1/2 right-2 inline-flex size-7 -translate-y-1/2 items-center justify-center rounded-md text-ink-soft hover:bg-zinc-100 hover:text-ink"
          >
            <X size={15} aria-hidden="true" />
          </button>
        )}
      </div>

      <div
        role="group"
        aria-label={t('design.picker.category')}
        className="flex gap-1.5 overflow-x-auto border-b border-hairline px-3 py-2 [scrollbar-width:none]"
      >
        {CATEGORIES.map((id) => {
          const on = category === id
          return (
            <button
              key={id}
              type="button"
              aria-pressed={on}
              // Keep focus (and the arrow keys) in the search field.
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => refilter(query, id)}
              className={`inline-flex h-7 shrink-0 items-center rounded-full px-3 text-xs font-medium whitespace-nowrap transition-colors ${
                on ? 'bg-ink text-white' : 'bg-zinc-100 text-ink-muted hover:bg-zinc-200 hover:text-ink'
              }`}
            >
              {t(`design.picker.categories.${id}`)}
            </button>
          )
        })}
      </div>

      {layout.options.length === 0 ? (
        <div className="px-5 py-8 text-center" role="status">
          <p className="text-sm font-medium text-ink">{t('design.picker.empty', { query: query.trim() })}</p>
          <p className="mt-1 text-xs text-ink-muted">{t('design.picker.emptyHint')}</p>
        </div>
      ) : (
        <div
          ref={scroller}
          onScroll={(event) => setScrollTop(event.currentTarget.scrollTop)}
          style={{ height: listHeight }}
          className="overflow-y-auto overscroll-contain py-1"
        >
          <div id={listId} role="listbox" aria-label={t('design.picker.list')} className="relative" style={{ height: layout.total }}>
            {items.slice(start, end).map((item, offset) => {
              const index = start + offset
              const top = layout.offsets[index]
              if (item.kind === 'header') {
                return (
                  <div
                    key={item.key}
                    role="presentation"
                    className="absolute inset-x-0 flex items-end justify-between px-4 pb-1.5 text-[11px] font-semibold tracking-[0.08em] text-ink-soft uppercase"
                    style={{ top, height: HEADER_H }}
                  >
                    <span>{item.label}</span>
                    {item.count !== undefined && <span className="font-medium tracking-normal normal-case tabular-nums">{t('design.picker.count', { count: item.count })}</span>}
                  </div>
                )
              }
              const ordinal = layout.ordinal[index]
              return (
                <FontRow
                  key={item.key}
                  id={optionId(ordinal)}
                  item={item}
                  top={top}
                  ordinal={ordinal}
                  setSize={layout.options.length}
                  active={ordinal === active}
                  selected={item.name === value}
                  recommended={item.name !== '' && item.name === recommended}
                  emptyLabel={emptyLabel}
                  emptyFace={recommended}
                  showCategory={category === 'all'}
                  onHover={() => ordinal !== active && setActive(ordinal)}
                  onPick={() => onSelect(item.name)}
                />
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}

interface FontRowProps {
  id: string
  item: Extract<Item, { kind: 'option' }>
  top: number
  ordinal: number
  setSize: number
  active: boolean
  selected: boolean
  recommended: boolean
  emptyLabel?: string
  emptyFace?: string
  showCategory: boolean
  onHover: () => void
  onPick: () => void
}

function FontRow({ id, item, top, ordinal, setSize, active, selected, recommended, emptyLabel, emptyFace, showCategory, onHover, onPick }: FontRowProps) {
  const t = useTranslations('common')
  const curated = item.section === 'curated' && isCuratedFont(item.name)
  const face = item.name ? fontFamilyOf(item.name) : emptyFace ? fontFamilyOf(emptyFace) : undefined
  return (
    <div
      id={id}
      role="option"
      aria-selected={selected}
      aria-posinset={ordinal + 1}
      aria-setsize={setSize}
      onPointerMove={onHover}
      // Keep focus in the search field.
      onMouseDown={(event) => event.preventDefault()}
      onClick={onPick}
      className="absolute inset-x-1.5 cursor-pointer"
      style={{ top, height: heightOf(item) }}
    >
      <div
        className={`flex h-full items-center gap-3 rounded-lg px-2.5 transition-colors ${active ? 'bg-zinc-100' : ''} ${selected ? 'text-ink' : 'text-zinc-800'}`}
      >
        <div className="min-w-0 flex-1">
          <p className="truncate text-[17px] leading-tight" style={{ fontFamily: face }}>
            {item.name || emptyLabel}
            {recommended && <span className="ml-1 font-sans text-xs font-medium text-accent">{t('design.recommended')}</span>}
          </p>
          {curated && <p className="mt-0.5 truncate text-xs text-ink-muted">{t(`design.fonts.${item.name as CuratedFontName}`)}</p>}
        </div>
        {showCategory && item.category && !selected && (
          <span className="shrink-0 text-[11px] text-ink-soft">{t(`design.picker.categories.${item.category}`)}</span>
        )}
        {selected && <Check size={16} aria-hidden="true" className="shrink-0 text-accent" />}
      </div>
    </div>
  )
}

type Translate = ReturnType<typeof useTranslations<'common'>>

function buildItems({
  query,
  category,
  value,
  extra,
  emptyLabel,
  t,
}: {
  query: string
  category: Category
  value: string
  extra: readonly string[]
  emptyLabel?: string
  t: Translate
}): Item[] {
  const q = query.trim().toLowerCase()
  const inCategory = (name: string, fallback?: FontCategory) => category === 'all' || (googleFontOf(name)?.category ?? fallback) === category
  const items: Item[] = []

  if (emptyLabel !== undefined && !q && category === 'all') items.push({ kind: 'option', key: 'empty', name: '', section: 'empty' })

  const curated = FONT_CHOICES.filter((font) => matches(font.name, q) && inCategory(font.name, font.kind))
  if (curated.length > 0) {
    items.push({ kind: 'header', key: 'h-curated', label: t('design.picker.suggested') })
    for (const font of curated) items.push({ kind: 'option', key: `c-${font.name}`, name: font.name, section: 'curated' })
  }

  // The brand's website fonts, first so they aren't lost among 1800 others, and a font typed elsewhere that isn't in
  // the catalogue, so it stays selectable as it is. A chosen catalogue font is simply found in the full list.
  const typed = value !== '' && googleFontOf(value) === undefined ? [value] : []
  const others = [...new Set([...extra, ...typed])].filter((name) => name !== '' && !isCuratedFont(name) && matches(name, q) && inCategory(name))
  if (others.length > 0) {
    items.push({ kind: 'header', key: 'h-other', label: t('design.other') })
    for (const name of others) items.push({ kind: 'option', key: `x-${name}`, name, section: 'other', category: googleFontOf(name)?.category })
  }

  const skip = new Set<string>([...curated.map((font) => font.name), ...others])
  const catalog = searchFonts(q, category === 'all' ? {} : { category }).filter((font) => !skip.has(font.name) && !isCuratedFont(font.name))
  if (catalog.length > 0) {
    items.push({ kind: 'header', key: 'h-catalog', label: q ? t('design.picker.results') : t('design.picker.all'), count: catalog.length })
    for (const font of catalog) items.push({ kind: 'option', key: `g-${font.name}`, name: font.name, section: 'catalog', category: font.category })
  }
  return items
}

function measure(items: Item[]) {
  const offsets: number[] = []
  const ordinal: number[] = []
  const options: number[] = []
  let total = 0
  items.forEach((item, index) => {
    offsets.push(total)
    total += heightOf(item)
    if (item.kind === 'option') {
      ordinal[index] = options.length
      options.push(index)
    }
  })
  return { offsets, ordinal, options, total }
}

/** The last item starting at or before y. */
function firstAt(offsets: number[], y: number): number {
  let lo = 0
  let hi = offsets.length - 1
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1
    if (offsets[mid] <= y) lo = mid
    else hi = mid - 1
  }
  return Math.max(0, lo)
}
