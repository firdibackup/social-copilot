'use client'

import { useLocale, useTranslations } from 'next-intl'
import { createTranslator } from 'next-intl'
import type { Locale } from '@/i18n/locale-config'
import idMessages from '@/../messages/id/editor.json'
import enMessages from '@/../messages/en/editor.json'

import { ArrowRight, CalendarClock, CalendarPlus, ChevronDown, ChevronLeft, ChevronRight } from 'lucide-react'
import {
  useActionState,
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type MouseEvent,
  type ReactNode,
} from 'react'
import { Notice } from '@/components/notice'
import { confirmSubmit } from '@/lib/confirm-submit'
import {
  calendarDays,
  firstOpenDay,
  formatLongDay,
  formatMonth,
  MIN_LEAD_MS,
  shiftMonth,
  timesOn,
  toWibInput,
  wibDateKey,
  type Slot,
} from '@/lib/format'
import type { Post } from '@/lib/posts'
import { savePostAction, type SaveState } from './actions'

const FOCUS = 'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent'
/** The neutral full-width pills for the queue shortcuts. */
const PILL = `flex w-full items-center justify-center gap-2 rounded-2xl border border-hairline bg-zinc-50 px-4 py-3 text-sm transition-colors hover:border-zinc-300 hover:bg-zinc-100 disabled:opacity-60 ${FOCUS}`
const QUIET = `rounded-lg px-2 py-1.5 text-[13px] font-medium text-ink-muted transition-colors hover:bg-zinc-50 hover:text-ink disabled:opacity-60 ${FOCUS}`
/** The selected day and time share one soft highlight. */
const PICKED = 'bg-zinc-100 font-semibold text-ink'
const SECTION_LABEL = 'text-[11px] font-medium tracking-wide text-ink-muted uppercase'

interface ScheduleButtonProps {
  post: Post
  /** The editor's current content, saved with the schedule. */
  caption: string
  assetIds: string[]
  slot: Slot
  /** The next empty posting slots, earliest first: the first is offered in one click, the rest as the queue. */
  queue: Slot[]
  disabled: boolean
}

function confirmNow(event: MouseEvent<HTMLButtonElement>, locale: Locale = 'id') {
  const t = createTranslator({ locale, messages: locale === 'en' ? enMessages : idMessages, namespace: 'scheduleButton' })

  void confirmSubmit(event, {
    title: t('message1'),
    description: t('message2'),
    confirmLabel: t('message3'),
  })
}

/** Left: the Jadwalkan dialog. Right: the suggested slot in one click. */
export function ScheduleButton({ post, caption, assetIds, slot, queue, disabled }: ScheduleButtonProps) {
  const t = useTranslations('editor.scheduleButton')
  const locale = useLocale()

  const [state, formAction, pending] = useActionState<SaveState, FormData>(savePostAction, { error: null })
  const dialogRef = useRef<HTMLDialogElement>(null)
  /** When the dialog opened: the picker is mounted fresh, with that moment as its "now", on every open. */
  const [openedAt, setOpenedAt] = useState<Date | null>(null)
  const off = disabled || pending
  const [next, ...later] = queue

  const content = (
    <>
      <input type="hidden" name="id" value={post.id} />
      <input type="hidden" name="caption" value={caption} />
      {assetIds.map((id) => (
        <input key={id} type="hidden" name="assetId" value={id} />
      ))}
    </>
  )

  /** A one-button form that schedules the post at `at`. */
  const slotForm = (at: Slot, button: ReactNode) => (
    <form action={formAction} className="contents">
      {content}
      <input type="hidden" name="intent" value="schedule" />
      <input type="hidden" name="scheduledAt" value={at.value} />
      {button}
    </form>
  )

  function confirmSlot(event: FormEvent<HTMLFormElement>) {
    void confirmSubmit(event, {
      title: t('message4', { v0: slot.label.toLowerCase() }),
      description: t('message5'),
      confirmLabel: t('message6'),
    })
  }

  return (
    <div className="ml-auto flex flex-col items-end gap-1.5">
      <div className="flex h-10">
        <button
          type="button"
          disabled={off}
          onClick={() => {
            setOpenedAt(new Date())
            dialogRef.current?.showModal()
          }}
          className="inline-flex items-center gap-2 rounded-l-xl bg-accent px-4 text-[14px] font-semibold text-white transition-colors hover:bg-accent-deep disabled:opacity-60"
        >
          <CalendarClock size={17} aria-hidden="true" />
          {post.status === 'scheduled' ? t('message7') : t('message6')}
        </button>
        <form action={formAction} onSubmit={confirmSlot} className="flex">
          {content}
          <input type="hidden" name="intent" value="schedule" />
          <input type="hidden" name="scheduledAt" value={slot.value} />
          <button
            type="submit"
            disabled={off}
            title={t('message8', { v0: slot.label.toLowerCase() })}
            className="inline-flex items-center gap-1.5 rounded-r-xl border-l border-white/25 bg-accent px-3 text-[13px] font-semibold text-white transition-colors hover:bg-accent-deep disabled:opacity-60"
          >
            {slot.label}
            <ArrowRight size={15} aria-hidden="true" />
          </button>
        </form>
      </div>
      {state.error && (
        <p role="alert" className="max-w-xs text-right text-xs text-red-700">
          {state.error}
        </p>
      )}

      <dialog
        ref={dialogRef}
        aria-labelledby="schedule-heading"
        onClose={() => setOpenedAt(null)}
        className="m-auto w-[min(28rem,calc(100%-2rem))] rounded-2xl p-0 backdrop:bg-[rgba(20,21,31,0.3)] backdrop:backdrop-blur-[2px]"
      >
        <div className="space-y-4 p-5">
          <div className="space-y-0.5">
            <h2 id="schedule-heading" className="text-lg font-semibold text-ink">
               {t('message6')} </h2>
            <p className="text-xs text-ink-muted">{t('message9')}</p>
          </div>

          {next ? (
            <div className="flex flex-col gap-2.5">
              {slotForm(
                next,
                <button type="submit" disabled={pending} className={PILL}>
                  <ArrowRight size={16} className="shrink-0 text-ink-muted" aria-hidden="true" />
                  <span className="font-semibold text-ink">{t('message10')}</span>
                  <span className="font-medium text-ink-muted tabular-nums">{next.label}</span>
                </button>,
              )}
              {later.length > 0 && (
                <details className="group">
                  <summary className={`${PILL} cursor-pointer list-none [&::-webkit-details-marker]:hidden`}>
                    <CalendarPlus size={16} className="shrink-0 text-ink-muted" aria-hidden="true" />
                    <span className="font-semibold text-ink">{t('message11')}</span>
                    <ChevronDown size={16} className="shrink-0 text-ink-muted transition-transform group-open:rotate-180" aria-hidden="true" />
                  </summary>
                  <ul className="mt-2 divide-y divide-hairline rounded-2xl border border-hairline">
                    {later.map((at) => (
                      <li key={at.value} className="flex items-center justify-between gap-3 px-4 py-2">
                        <span className="text-sm text-ink tabular-nums">{at.label}</span>
                        {slotForm(
                          at,
                          <button
                            type="submit"
                            disabled={pending}
                            className="rounded-lg px-2.5 py-1 text-xs font-semibold text-accent transition-colors hover:bg-accent-soft disabled:opacity-60"
                          >
                             {t('message12')} </button>,
                        )}
                      </li>
                    ))}
                  </ul>
                </details>
              )}
            </div>
          ) : (
            <p className="rounded-2xl border border-dashed border-hairline px-4 py-3 text-xs text-ink-muted">
               {t('message13')} </p>
          )}

          <form action={formAction} className="space-y-3">
            {content}
            <p className={SECTION_LABEL}>{t('message14')}</p>
            {openedAt && (
              <DateTimePicker
                key={openedAt.getTime()}
                now={openedAt}
                initial={post.scheduledAt}
                pending={pending}
              >
                {state.error && <Notice tone="error">{state.error}</Notice>}
              </DateTimePicker>
            )}
            <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
              <button type="button" onClick={() => dialogRef.current?.close()} className={QUIET}>
                 {t('message15')} </button>
              <button type="submit" name="intent" value="now" disabled={pending} onClick={(event) => confirmNow(event, locale)} className={QUIET}>
                 {t('message16')} </button>
            </div>
          </form>
        </div>
      </dialog>
    </div>
  )
}

const timeLabel = (time: string) => time.replace(':', '.')

interface DateTimePickerProps {
  /** When the dialog opened; past days and times closer than 30 minutes are offered from here. */
  now: Date
  /** The post's current schedule, preselected when it is still open. */
  initial: Date | null
  pending: boolean
  /** Shown between the picker and its Jadwalkan button, e.g. the error notice. */
  children?: ReactNode
}

/** A month calendar and a 15-minute time column, in WIB, that schedule the form at the picked moment. */
function DateTimePicker({ now, initial, pending, children }: DateTimePickerProps) {
  const t = useTranslations('editor.scheduleButton')
  const locale = useLocale()

  const today = wibDateKey(now)
  const openDay = firstOpenDay(now)
  const [start] = useState(() => {
    const value = initial ? toWibInput(initial) : null
    const day = value?.slice(0, 10)
    const time = value?.slice(11)
    // A schedule that is already past (or too close) is not preselected: the server would refuse it anyway.
    if (day && time && initial && initial.getTime() - now.getTime() >= MIN_LEAD_MS) return { day, time }
    return { day: openDay, time: null }
  })
  const [day, setDay] = useState(start.day)
  const [time, setTime] = useState<string | null>(start.time)
  const [month, setMonth] = useState(start.day.slice(0, 7))
  const listRef = useRef<HTMLDivElement>(null)

  const grid = timesOn(day, now)
  // A rescheduled post may sit off the 15-minute grid; keep its own time in the list.
  const times = start.time && day === start.day && !grid.includes(start.time) ? [...grid, start.time].sort() : grid

  useEffect(() => {
    const list = listRef.current
    if (!list) return
    const target = list.querySelector<HTMLElement>('[aria-pressed="true"]') ?? list.querySelector<HTMLElement>('button')
    list.scrollTop = target ? Math.max(0, target.offsetTop - 8) : 0
    // Only when the day changes; picking a time must not move the list under the pointer.
  }, [day])

  function pickDay(next: string) {
    setDay(next)
    setMonth(next.slice(0, 7))
    if (time && !timesOn(next, now).includes(time)) setTime(null)
  }

  const value = time ? `${day}T${time}` : ''
  const canGoBack = shiftMonth(month, -1) >= today.slice(0, 7)

  return (
    <>
      <input type="hidden" name="scheduledAt" value={value} />
      <div className="flex rounded-2xl border border-hairline">
        <div className="min-w-0 flex-1 p-3">
          <div className="mb-2 flex items-center justify-between">
            <button
              type="button"
              onClick={() => setMonth(shiftMonth(month, -1))}
              disabled={!canGoBack}
              aria-label={t('message17')}
              className={`grid size-8 place-items-center rounded-lg text-ink-muted transition-colors hover:bg-zinc-100 hover:text-ink disabled:pointer-events-none disabled:opacity-30 ${FOCUS}`}
            >
              <ChevronLeft size={16} aria-hidden="true" />
            </button>
            <p aria-live="polite" className="text-sm font-semibold text-ink">
              {formatMonth(month, locale)}
            </p>
            <button
              type="button"
              onClick={() => setMonth(shiftMonth(month, 1))}
              aria-label={t('message18')}
              className={`grid size-8 place-items-center rounded-lg text-ink-muted transition-colors hover:bg-zinc-100 hover:text-ink ${FOCUS}`}
            >
              <ChevronRight size={16} aria-hidden="true" />
            </button>
          </div>
          <div role="group" aria-label={t('message19', { v0: formatMonth(month, locale) })} className="grid grid-cols-7 gap-y-0.5 text-center">
            {([0, 1, 2, 3, 4, 5, 6] as const).map((day) => (
              <abbr key={day} title={t(`day${day}.full`)} className="pb-1 text-[11px] font-medium text-ink-soft no-underline">
                {t(`day${day}.short`)}
              </abbr>
            ))}
            {calendarDays(month).map((key) => {
              const selected = key === day
              const open = key >= openDay
              const outside = key.slice(0, 7) !== month
              const tone = selected
                ? PICKED
                : !open
                  ? 'text-zinc-300'
                  : outside
                    ? 'text-ink-soft hover:bg-zinc-50'
                    : key === today
                      ? 'font-semibold text-accent hover:bg-zinc-50'
                      : 'text-ink hover:bg-zinc-50'
              return (
                <button
                  key={key}
                  type="button"
                  disabled={!open}
                  onClick={() => pickDay(key)}
                  aria-pressed={selected}
                  aria-label={`${formatLongDay(key, locale)} ${key.slice(0, 4)}${key === today ? t('message20') : ''}`}
                  className={`mx-auto grid h-9 w-full max-w-9 place-items-center rounded-lg text-[13px] tabular-nums transition-colors disabled:cursor-not-allowed ${tone} ${FOCUS}`}
                >
                  {Number(key.slice(8))}
                </button>
              )
            })}
          </div>
        </div>

        <div className="relative w-[4.5rem] shrink-0 border-l border-hairline">
          <div className="absolute inset-0 flex flex-col">
            <p className={`${SECTION_LABEL} px-2 pt-4 pb-2 text-center`}>{t('message21')}</p>
            <div
              ref={listRef}
              role="group"
              aria-label={t('message22', { v0: formatLongDay(day, locale) })}
              className="relative min-h-0 flex-1 overflow-y-auto overscroll-contain px-1.5 pb-8 [mask-image:linear-gradient(to_bottom,black_calc(100%-2.5rem),transparent)] [scrollbar-width:none]"
            >
              {times.length > 0 ? (
                times.map((timeValue) => (
                  <button
                    key={timeValue}
                    type="button"
                    onClick={() => setTime(timeValue)}
                    aria-pressed={timeValue === time}
                    aria-label={t('message23', { v0: timeLabel(timeValue) })}
                    className={`block w-full rounded-lg py-1.5 text-center text-[13px] tabular-nums transition-colors ${timeValue === time ? PICKED : 'text-ink hover:bg-zinc-50'} ${FOCUS} focus-visible:outline-offset-[-2px]`}
                  >
                    {timeLabel(timeValue)}
                  </button>
                ))
              ) : (
                <p className="px-1 pt-2 text-center text-[11px] text-ink-muted">{t('message24')}</p>
              )}
            </div>
          </div>
        </div>
      </div>

      {children}

      <button
        type="submit"
        name="intent"
        value="schedule"
        disabled={!time || pending}
        className={`w-full rounded-2xl py-3.5 text-[15px] font-semibold transition-colors ${FOCUS} ${
          time ? 'bg-accent text-white hover:bg-accent-deep disabled:opacity-60' : 'cursor-not-allowed bg-zinc-100 text-ink-soft'
        }`}
      >
         {t('message6')} </button>
    </>
  )
}
