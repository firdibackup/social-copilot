'use client'

import { useTranslations } from 'next-intl'
import { Check, Grid2x2, Minus, Plus, RotateCcw, X } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { cellsOf, cropTile, loadGrid, type GridSource } from '@/lib/grid-crop'
import { MAX_GRID_COLS, MAX_GRID_ROWS, type GridSize, type Rect } from '@/lib/grid-split'
import type { PreparedReference } from '@/lib/image'
import { Skeleton } from './loading-state'
import { Notice } from './notice'

/** The on-screen copy of the picture: big enough to judge the cuts, small enough to stay light. */
const PREVIEW_EDGE = 1400

const SMALL_BUTTON =
  'inline-flex items-center gap-1.5 rounded-lg border border-zinc-200 bg-white px-2.5 py-1.5 text-xs font-medium text-zinc-800 hover:bg-zinc-50 disabled:opacity-50'
const CANCEL_BUTTON =
  'inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900 disabled:opacity-50'

export interface GridTile {
  /** Stable for this grid size and cell: per-tile state keyed by it resets when the grid changes. */
  key: string
  /** Position in the grid, row by row, from 0. */
  index: number
  /** The cell in the full picture's pixels. */
  rect: Rect
}

export interface GridSelection {
  /** The selected cells not added yet, in grid order. */
  tiles: GridTile[]
  /** Cells not added yet, selected or not. */
  remaining: number
  /** The cell as a JPEG (≤1080 px) with its palette; cached, so detecting then adding crops once. */
  crop: (tile: GridTile) => Promise<PreparedReference>
  /** Marks cells as added: they show a badge, can't be picked again, and leave the selection. */
  markAdded: (tiles: GridTile[]) => void
}

interface GridSplitterProps {
  file: File
  /** How many cells may be selected at once (room left); no cap when omitted. */
  maxSelectable?: number
  /** Shown when the cap keeps cells out; defaults to a plain limit message. */
  limitHint?: string
  /** Locks the grid and the selection while the parent crops or uploads. */
  busy?: boolean
  onCancel: () => void
  /** Extra content under each selected cell's thumbnail (label, description…); no tile list when omitted. */
  renderTile?: (tile: GridTile) => ReactNode
  /** The parent's actions for the current selection. */
  children: (selection: GridSelection) => ReactNode
}

interface Loaded {
  source: GridSource
  preview: string
}

const gridKeyOf = (grid: GridSize) => `${grid.cols}x${grid.rows}`

async function previewOf(source: GridSource): Promise<string> {
  const scale = Math.min(1, PREVIEW_EDGE / Math.max(source.width, source.height))
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, Math.round(source.width * scale))
  canvas.height = Math.max(1, Math.round(source.height * scale))
  const context = canvas.getContext('2d')
  if (!context) throw new Error('Canvas tidak tersedia di browser ini')
  context.drawImage(source.bitmap, 0, 0, canvas.width, canvas.height)
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.85))
  if (!blob) throw new Error('Pratinjau gagal dibuat')
  return URL.createObjectURL(blob)
}

/**
 * Splits a picture of several designs (a profile screenshot, a moodboard) into cells the owner picks from. Key it by
 * the file: a new picture starts fresh.
 */
export function GridSplitter({ file, maxSelectable, limitHint, busy = false, onCancel, renderTile, children }: GridSplitterProps) {
  const t = useTranslations('common')
  const [loaded, setLoaded] = useState<Loaded | null>(null)
  const [failed, setFailed] = useState(false)
  const [chosenGrid, setChosenGrid] = useState<GridSize | null>(null)
  const [picked, setPicked] = useState<{ key: string; set: ReadonlySet<number> } | null>(null)
  const [added, setAdded] = useState<ReadonlySet<string>>(new Set())
  // A cache, not render state: filled from event handlers only.
  const [crops] = useState(() => new Map<string, Promise<PreparedReference>>())

  useEffect(() => {
    let active = true
    let source: GridSource | null = null
    let preview: string | null = null
    loadGrid(file)
      .then(async (result) => {
        if (!active) return result.bitmap.close()
        source = result
        const url = await previewOf(result)
        if (!active) return URL.revokeObjectURL(url)
        preview = url
        setLoaded({ source: result, preview: url })
      })
      .catch(() => active && setFailed(true))
    return () => {
      active = false
      source?.bitmap.close()
      if (preview) URL.revokeObjectURL(preview)
    }
  }, [file])

  const source = loaded?.source ?? null
  const crop = useCallback(
    (tile: GridTile) => {
      if (!source) return Promise.reject(new Error(t('grid.notReady')))
      let promise = crops.get(tile.key)
      if (!promise) {
        promise = cropTile(source, tile.rect)
        // A failed crop is tried again next time.
        promise.catch(() => crops.delete(tile.key))
        crops.set(tile.key, promise)
      }
      return promise
    },
    [source, crops, t],
  )

  const grid = chosenGrid ?? source?.detected ?? { cols: 1, rows: 1 }
  const gridKey = gridKeyOf(grid)
  const { cols, rows } = grid
  // cellsOf reads the whole picture's seams: worth keeping per grid, not per render.
  const cellRects = useMemo(() => (source ? cellsOf(source, { cols, rows }) : []), [source, cols, rows])

  const keyOf = (index: number) => `${gridKey}-${index}`
  const open = cellRects.map((_, index) => index).filter((index) => !added.has(keyOf(index)))
  const limit = Math.max(0, Math.min(maxSelectable ?? Infinity, open.length))
  const selected = picked?.key === gridKey ? picked.set : new Set(open.slice(0, limit))
  const chosen = open.filter((index) => selected.has(index)).slice(0, limit)
  const tiles: GridTile[] = chosen.map((index) => ({ key: keyOf(index), index, rect: cellRects[index] }))
  const full = chosen.length >= limit

  function choose(next: Iterable<number>) {
    setPicked({ key: gridKey, set: new Set(next) })
  }

  function toggle(index: number) {
    if (busy || added.has(keyOf(index))) return
    if (chosen.includes(index)) choose(chosen.filter((item) => item !== index))
    else if (!full) choose([...chosen, index])
  }

  function changeGrid(next: GridSize) {
    if (busy) return
    setChosenGrid(next)
  }

  const markAdded = (done: GridTile[]) => {
    setAdded((previous) => new Set([...previous, ...done.map((tile) => tile.key)]))
    const doneKeys = new Set(done.map((tile) => tile.key))
    setPicked({ key: gridKey, set: new Set(chosen.filter((index) => !doneKeys.has(keyOf(index)))) })
  }

  if (failed) {
    return (
      <div className="space-y-3">
        <Notice tone="error">{t('grid.imageError')}</Notice>
        <button type="button" onClick={onCancel} className={SMALL_BUTTON}>
          {t('grid.close')}
        </button>
      </div>
    )
  }

  if (!loaded || !source) {
    return (
      <div role="status" className="space-y-3">
        <p className="text-sm text-zinc-500">{t('grid.reading')}</p>
        <Skeleton className="mx-auto aspect-[4/5] w-full max-w-sm rounded-lg" />
      </div>
    )
  }

  const detected = source.detected
  const undetected = detected.cols * detected.rows <= 1
  const edited = gridKeyOf(detected) !== gridKey
  const ratio = source.width / source.height

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 space-y-0.5">
          <p className="flex items-center gap-1.5 text-sm font-semibold text-zinc-900">
            <Grid2x2 size={16} aria-hidden="true" className="text-primary" />
            {t('grid.title')}
          </p>
          <p className="truncate text-xs text-zinc-500">{file.name}</p>
        </div>
        <button
          type="button"
          onClick={onCancel}
          disabled={busy}
          aria-label={t('grid.closeGrid')}
          className="rounded-lg p-1.5 text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900 disabled:opacity-50"
        >
          <X size={16} aria-hidden="true" />
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-x-5 gap-y-3 rounded-lg bg-zinc-50 px-3 py-2.5">
        <Stepper label={t('grid.columns')} value={grid.cols} max={MAX_GRID_COLS} disabled={busy} onChange={(cols) => changeGrid({ ...grid, cols })} />
        <Stepper label={t('grid.rows')} value={grid.rows} max={MAX_GRID_ROWS} disabled={busy} onChange={(rows) => changeGrid({ ...grid, rows })} />
        {edited && !undetected && (
          <button type="button" onClick={() => changeGrid(detected)} disabled={busy} className={SMALL_BUTTON}>
            <RotateCcw size={12} aria-hidden="true" />
            {t('grid.reset', { cols: detected.cols, rows: detected.rows })}
          </button>
        )}
        <div className="flex flex-wrap items-center gap-2 sm:ml-auto">
          <span className="text-xs text-zinc-500 tabular-nums" aria-live="polite">
            {t('grid.selected', { count: chosen.length, total: open.length })}
          </span>
          <button type="button" onClick={() => choose(open.slice(0, limit))} disabled={busy || full} className={SMALL_BUTTON}>
            {t('grid.selectAll')}
          </button>
          <button type="button" onClick={() => choose([])} disabled={busy || chosen.length === 0} className={SMALL_BUTTON}>
            {t('grid.clear')}
          </button>
        </div>
      </div>

      {undetected && !edited ? (
        <Notice tone="warning">{t('grid.undetected')}</Notice>
      ) : (
        <p className="text-xs text-zinc-500">
          {t(edited ? 'grid.manual' : 'grid.detected', { cols: grid.cols, rows: grid.rows })}{' '}{t('grid.pickHint')}
        </p>
      )}
      {limit < open.length && (
        <Notice tone="warning">{limitHint ?? t('grid.limit', { count: limit })}</Notice>
      )}

      <div
        className="relative mx-auto animate-fade-in overflow-hidden rounded-lg bg-zinc-100 shadow-sm select-none"
        style={{ aspectRatio: `${source.width} / ${source.height}`, width: `min(100%, calc(65vh * ${ratio}))` }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={loaded.preview} alt={t('grid.alt', { name: file.name })} draggable={false} className="absolute inset-0 size-full" />
        {cellRects.map((rect, index) => {
          const done = added.has(keyOf(index))
          const on = chosen.includes(index)
          const blocked = !on && full
          return (
            <button
              key={keyOf(index)}
              type="button"
              onClick={() => toggle(index)}
              disabled={busy || done || blocked}
              aria-pressed={on}
              aria-label={t('grid.tileLabel', { count: index + 1, suffix: done ? t('grid.addedSuffix') : '' })}
              title={blocked ? t('grid.limitReached') : undefined}
              className={`group absolute transition-[background-color,box-shadow] duration-150 focus-visible:outline-2 focus-visible:-outline-offset-4 focus-visible:outline-white disabled:cursor-not-allowed ${
                done
                  ? 'bg-zinc-950/65'
                  : on
                    ? 'shadow-[inset_0_0_0_3px_var(--color-primary),inset_0_0_0_4px_rgb(255_255_255/0.9)] hover:bg-primary/10'
                    : 'bg-zinc-950/55 shadow-[inset_0_0_0_1px_rgb(255_255_255/0.6)] hover:bg-zinc-950/35'
              }`}
              style={{
                left: `${(rect.x / source.width) * 100}%`,
                top: `${(rect.y / source.height) * 100}%`,
                width: `${(rect.width / source.width) * 100}%`,
                height: `${(rect.height / source.height) * 100}%`,
              }}
            >
              <span
                aria-hidden="true"
                className={`absolute top-1.5 left-1.5 min-w-5 rounded-full px-1.5 text-center text-[11px] leading-5 font-semibold tabular-nums ${
                  on ? 'bg-primary text-white' : 'bg-white/85 text-zinc-700'
                }`}
              >
                {index + 1}
              </span>
              {on && (
                <span aria-hidden="true" className="absolute top-1.5 right-1.5 rounded-full bg-primary p-0.5 text-white">
                  <Check size={12} />
                </span>
              )}
              {done && (
                <span
                  aria-hidden="true"
                  className="absolute inset-x-1.5 bottom-1.5 truncate rounded bg-white/90 px-1 py-0.5 text-center text-[11px] font-medium text-zinc-700"
                >
                  {t('grid.added')}
                </span>
              )}
            </button>
          )
        })}
      </div>

      {renderTile && tiles.length > 0 && (
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {tiles.map((tile) => (
            <li key={tile.key} className="flex gap-3 rounded-lg border border-zinc-200 bg-white p-2.5">
              <div className="w-20 shrink-0 space-y-1">
                <div
                  className="relative overflow-hidden rounded-md bg-zinc-100"
                  style={{ aspectRatio: `${tile.rect.width} / ${tile.rect.height}` }}
                >
                  <TilePicture preview={loaded.preview} source={source} rect={tile.rect} />
                </div>
                <p className="text-center text-[11px] font-medium text-zinc-500">{t('grid.tile', { count: tile.index + 1 })}</p>
              </div>
              <div className="min-w-0 flex-1">{renderTile(tile)}</div>
            </li>
          ))}
        </ul>
      )}

      <div className="flex flex-wrap items-center gap-2">
        {children({ tiles, remaining: open.length, crop, markAdded })}
        <button type="button" onClick={onCancel} disabled={busy} className={CANCEL_BUTTON}>
          {t('cancel')}
        </button>
      </div>
    </div>
  )
}

/** One cell of the preview, filling its box: the whole picture scaled and shifted so only the cell shows. */
function TilePicture({ preview, source, rect }: { preview: string; source: GridSource; rect: Rect }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={preview}
      alt=""
      draggable={false}
      className="absolute max-w-none"
      style={{
        width: `${(source.width / rect.width) * 100}%`,
        height: `${(source.height / rect.height) * 100}%`,
        left: `${(-rect.x / rect.width) * 100}%`,
        top: `${(-rect.y / rect.height) * 100}%`,
      }}
    />
  )
}

interface StepperProps {
  label: string
  value: number
  max: number
  disabled: boolean
  onChange: (value: number) => void
}

function Stepper({ label, value, max, disabled, onChange }: StepperProps) {
  const t = useTranslations('common')
  const name = label.toLowerCase()
  return (
    <div role="group" aria-label={label} className="flex items-center gap-2">
      <span className="text-xs font-medium text-zinc-500">{label}</span>
      <div className="inline-flex items-center rounded-lg border border-zinc-200 bg-white">
        <button
          type="button"
          onClick={() => onChange(value - 1)}
          disabled={disabled || value <= 1}
          aria-label={t('grid.decrease', { name })}
          className="rounded-l-lg p-1.5 text-zinc-700 hover:bg-zinc-50 disabled:opacity-40"
        >
          <Minus size={14} aria-hidden="true" />
        </button>
        <output aria-live="polite" aria-label={t('grid.count', { name })} className="w-7 text-center text-sm font-semibold tabular-nums text-zinc-900">
          {value}
        </output>
        <button
          type="button"
          onClick={() => onChange(value + 1)}
          disabled={disabled || value >= max}
          aria-label={t('grid.increase', { name })}
          className="rounded-r-lg p-1.5 text-zinc-700 hover:bg-zinc-50 disabled:opacity-40"
        >
          <Plus size={14} aria-hidden="true" />
        </button>
      </div>
    </div>
  )
}
