'use client'

import { useTranslations } from 'next-intl'
import { Plus, X } from 'lucide-react'
import { useState, useTransition } from 'react'
import {
  countSlots,
  generateSlots,
  MAX_POSTS_PER_WEEK,
  MAX_SLOT_TIMES,
  MIN_POSTS_PER_WEEK,
  type PostingSlot,
} from '@/lib/schedule-slots'
import { Notice } from './notice'
import { saveSlotsAction } from './slot-actions'

/** Every quarter hour of the day, the times a row offers. */
const QUARTERS = Array.from(
  { length: 96 },
  (_, index) => `${String(Math.floor(index / 4)).padStart(2, '0')}:${String((index % 4) * 15).padStart(2, '0')}`,
)
/** A new row takes the first of these the table doesn't have yet. */
const NEW_ROW_TIMES = ['19:00', '12:00', '08:00', '21:00']
const PRESETS = Array.from({ length: MAX_POSTS_PER_WEEK - MIN_POSTS_PER_WEEK + 1 }, (_, index) => index + MIN_POSTS_PER_WEEK)
const SELECT =
  'rounded-lg border border-zinc-200 bg-white px-2 py-1 text-sm tabular-nums text-zinc-900 focus:border-zinc-400 focus:outline-none'

const dotted = (time: string) => time.replace(':', '.')
const byTime = (a: PostingSlot, b: PostingSlot) => a.time.localeCompare(b.time)

interface SlotEditorProps {
  initialSlots: PostingSlot[]
  /** Still the default from the Brand strategy: said so until the first change. */
  isDefault: boolean
  /** Pengaturan also offers the posts-per-week preset under the table. */
  withPreset?: boolean
}

/**
 * The posting slots as a table: a row per time, a checkbox per weekday. Every change is saved at once; posts already
 * scheduled keep their times.
 */
export function SlotEditor({ initialSlots, isDefault, withPreset = false }: SlotEditorProps) {
  const t = useTranslations('common')
  const weekdays = (['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as const).map((day) => t(`slots.weekdays.${day}`))
  const [slots, setSlots] = useState(initialSlots)
  const [changed, setChanged] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saving, startSaving] = useTransition()
  const count = countSlots(slots)

  function save(next: PostingSlot[]) {
    const sorted = [...next].sort(byTime)
    setSlots(sorted)
    setChanged(true)
    setError(null)
    startSaving(async () => {
      const result = await saveSlotsAction(sorted).catch(() => ({ error: t('slots.failed') }))
      if ('error' in result) setError(result.error)
    })
  }

  function toggle(row: number, day: number) {
    save(
      slots.map((slot, index) =>
        index !== row
          ? slot
          : {
              ...slot,
              days: slot.days.includes(day)
                ? slot.days.filter((value) => value !== day)
                : [...slot.days, day].sort((a, b) => a - b),
            },
      ),
    )
  }

  function changeTime(row: number, time: string) {
    if (slots.some((slot, index) => index !== row && slot.time === time)) {
      setError(t('slots.exists', { time: dotted(time) }))
      return
    }
    save(slots.map((slot, index) => (index === row ? { ...slot, time } : slot)))
  }

  function addRow() {
    const used = new Set(slots.map((slot) => slot.time))
    const time = NEW_ROW_TIMES.find((value) => !used.has(value)) ?? QUARTERS.find((value) => !used.has(value)) ?? '19:00'
    save([...slots, { time, days: [] }])
  }

  return (
    <div className="space-y-4">
      <div className="space-y-1">
        <p className="text-sm font-medium text-zinc-900">
          {t.rich('slots.count', { count, n: (chunks) => <span className="tabular-nums">{chunks}</span> })}
        </p>
        <p className="text-xs text-zinc-500">
          {t('slots.scheduleHint')}
          {isDefault && !changed && t('slots.defaultHint')}
        </p>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[21rem] border-separate border-spacing-y-1 text-center text-sm">
          <thead>
            <tr className="text-[11px] font-medium tracking-wide text-zinc-500 uppercase">
              <th scope="col" className="w-24 pb-1 text-left font-medium">
                {t('slots.time')}
              </th>
              {weekdays.map((day) => (
                <th key={day} scope="col" className="pb-1 font-medium">
                  {day}
                </th>
              ))}
              <th scope="col" className="w-8">
                <span className="sr-only">{t('delete')}</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {slots.map((slot, row) => (
              <tr key={slot.time}>
                <td className="text-left">
                  <select
                    aria-label={t('slots.row', { row: row + 1 })}
                    value={slot.time}
                    onChange={(event) => changeTime(row, event.target.value)}
                    className={SELECT}
                  >
                    {(QUARTERS.includes(slot.time) ? QUARTERS : [slot.time, ...QUARTERS]).map((time) => (
                      <option key={time} value={time}>
                        {dotted(time)}
                      </option>
                    ))}
                  </select>
                </td>
                {weekdays.map((day, index) => (
                  <td key={day}>
                    <input
                      type="checkbox"
                      checked={slot.days.includes(index + 1)}
                      onChange={() => toggle(row, index + 1)}
                      aria-label={`${day} ${dotted(slot.time)}`}
                      className="size-4 cursor-pointer accent-accent"
                    />
                  </td>
                ))}
                <td>
                  <button
                    type="button"
                    onClick={() => save(slots.filter((_, index) => index !== row))}
                    aria-label={t('slots.remove', { time: dotted(slot.time) })}
                    className="rounded-md p-1 text-zinc-400 transition-colors hover:bg-zinc-100 hover:text-zinc-900"
                  >
                    <X size={14} aria-hidden="true" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {slots.length < MAX_SLOT_TIMES && (
        <button
          type="button"
          onClick={addRow}
          className="flex h-9 w-full items-center justify-center gap-1.5 rounded-lg border border-dashed border-zinc-300 text-sm text-zinc-500 transition-colors hover:border-accent hover:text-accent"
        >
          <Plus size={16} aria-hidden="true" />
          {t('slots.add')}
        </button>
      )}

      {withPreset && (
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-zinc-100 pt-4">
          <label htmlFor="posting-per-minggu" className="min-w-0 flex-1">
            <span className="block text-sm font-medium text-zinc-900">{t('slots.perWeek')}</span>
            <span className="block text-xs text-zinc-500">
              {t('slots.presetHint')}
            </span>
          </label>
          <select
            id="posting-per-minggu"
            value={count >= MIN_POSTS_PER_WEEK && count <= MAX_POSTS_PER_WEEK ? String(count) : ''}
            onChange={(event) => {
              const postsPerWeek = Number(event.target.value)
              if (postsPerWeek) save(generateSlots(postsPerWeek))
            }}
            className={SELECT}
          >
            {count === 0 && <option value="">—</option>}
            {PRESETS.map((value) => (
              <option key={value} value={value}>
                {t('slots.posts', { count: value })}
              </option>
            ))}
          </select>
        </div>
      )}

      <p role="status" className="min-h-4 text-xs text-zinc-500">
        {saving ? t('slots.saving') : changed && !error ? t('slots.saved') : ''}
      </p>
      {error && <Notice tone="error">{error}</Notice>}
    </div>
  )
}
