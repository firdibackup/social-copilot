'use client'

import { useLocale, useTranslations } from 'next-intl'

import { ChevronRight, MoreHorizontal, Pause, Pencil, Play, Trash2 } from 'lucide-react'
import Link from 'next/link'
import { useEffect, useRef, useState } from 'react'
import { confirmDialog } from '@/components/confirm-dialog'
import { Notice } from '@/components/notice'
import type { AutoDmRun } from '@/lib/auto-dm'
import { type AutoDmRule } from '@/lib/auto-dm-rules'
import { formatShortDateTime } from '@/lib/format'
import { deleteAutoDmRuleAction, setAutoDmRuleActiveAction } from './auto-dm-actions'

export interface RuleCard {
  rule: AutoDmRule
  /** Its most recent run, or null before the first matching comment. */
  run: AutoDmRun | null
}

const MENU_ITEM = 'flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-zinc-50 disabled:opacity-50'

const editRuleHref = (id: string) => `/balasan/auto-dm?id=${id}`

/** "Aturan Auto DM (n)" on the DM tab: every rule with its status and last activity. */
export function AutoDmRules({ cards, username }: { cards: RuleCard[]; username: string }) {
  const t = useTranslations('inbox.autoDmRules')
  const [open, setOpen] = useState(true)
  return (
    <section aria-labelledby="aturan-auto-dm" className="scroll-mt-4 space-y-3">
      <button
        type="button"
        id="aturan-auto-dm"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
        className="inline-flex items-center gap-1.5 font-medium text-zinc-900"
      >
        <ChevronRight size={18} aria-hidden="true" className={open ? 'rotate-90' : undefined} />
        {t('heading', { count: cards.length })}
      </button>
      {open && (
        <div className="space-y-3">
          <p className="text-sm text-zinc-500">{t('description', { username })}</p>
          {cards.length === 0 ? (
            <p className="rounded-xl border border-dashed border-zinc-300 p-6 text-center text-sm text-zinc-500">
              {t('noRulesYetClickAutoDmToCreateYour')}
              </p>
          ) : (
            <ul className="space-y-3">
              {cards.map((card) => (
                <RuleCardView key={card.rule.id} card={card} />
              ))}
            </ul>
          )}
        </div>
      )}
    </section>
  )
}

function RuleCardView({ card }: { card: RuleCard }) {
  const t = useTranslations('inbox.autoDmRules')
  const { rule, run } = card
  const [error, setError] = useState<string | null>(null)
  return (
    <li className="overflow-hidden rounded-xl border border-zinc-200 bg-white">
      <div className="flex items-start justify-between gap-3 px-4 py-3">
        <div className="min-w-0 space-y-1">
          <p className="flex items-center gap-2">
            <span className="truncate font-semibold text-zinc-900">{rule.name}</span>
            <span
              className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                rule.isActive ? 'bg-zinc-900 text-white' : 'bg-zinc-200 text-zinc-600'
              }`}
            >
              {rule.isActive ? t('active') : t('paused')}
            </span>
          </p>
          <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
            <strong className="font-semibold text-zinc-900">
              {rule.matchAny ? t('allComments') : rule.keywords.join(', ')}
            </strong>
            <span className="text-zinc-500">{rule.mediaId === null ? t('allPosts') : t('onePost')}</span>
            {rule.opener && (
              <span className="rounded-full border border-zinc-200 px-2 py-0.5 text-xs font-medium text-zinc-700">
                {t('startAChat')}
                </span>
            )}
          </p>
        </div>
        <RuleMenu rule={rule} onError={setError} />
      </div>
      {error && (
        <div className="px-4 pb-3">
          <Notice tone="error">{error}</Notice>
        </div>
      )}
      <div className="border-t border-zinc-100 bg-zinc-50 px-4 py-3">
        <p className="text-[11px] font-semibold tracking-[0.06em] text-zinc-500 uppercase">{t('latestActivity')}</p>
        <LastRun run={run} />
      </div>
    </li>
  )
}

function LastRun({ run }: { run: AutoDmRun | null }) {
  const locale = useLocale()
  const t = useTranslations('inbox.autoDmRules')
  if (!run) return <p className="mt-1 text-sm text-zinc-500">{t('noMatchingCommentsYet')}</p>
  const who = run.username ? `@${run.username}` : run.source === 'dm' ? t('someoneViaDm') : t('someone')
  return (
    <div className="mt-1 space-y-0.5 text-sm">
      <p className="text-zinc-800">
        {who} · “{run.text}” · <span className={run.step === 'failed' ? 'font-medium text-red-700' : 'font-medium'}>{t(`runStep.${run.step}`)}</span>
        <span className="text-zinc-500"> · {formatShortDateTime(run.updatedAt, locale)}</span>
      </p>
      {run.error && <p className="text-xs text-red-700">{run.error}</p>}
    </div>
  )
}

function RuleMenu({ rule, onError }: { rule: AutoDmRule; onError: (error: string | null) => void }) {
  const t = useTranslations('inbox.autoDmRules')
  const FAILED = t('couldnTReachTheServerTryAgain')
  const [open, setOpen] = useState(false)
  const [pending, setPending] = useState(false)
  const menu = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const close = (event: MouseEvent) => {
      if (!menu.current?.contains(event.target as Node)) setOpen(false)
    }
    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', close)
    document.addEventListener('keydown', escape)
    return () => {
      document.removeEventListener('mousedown', close)
      document.removeEventListener('keydown', escape)
    }
  }, [open])

  async function run(action: () => Promise<string | null>) {
    setOpen(false)
    setPending(true)
    onError(await action().catch(() => FAILED))
    setPending(false)
  }

  return (
    <div ref={menu} className="relative">
      <button
        type="button"
        aria-label={t('ruleMenu', { name: rule.name })}
        aria-haspopup="menu"
        aria-expanded={open}
        disabled={pending}
        onClick={() => setOpen(!open)}
        className="flex size-8 items-center justify-center rounded-full text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900 disabled:opacity-50"
      >
        <MoreHorizontal size={18} aria-hidden="true" />
      </button>
      {open && (
        <div role="menu" className="absolute top-9 right-0 z-10 w-40 overflow-hidden rounded-lg border border-zinc-200 bg-white py-1 shadow-lg">
          <button
            type="button"
            role="menuitem"
            onClick={() => run(() => setAutoDmRuleActiveAction(rule.id, !rule.isActive))}
            className={MENU_ITEM}
          >
            {rule.isActive ? <Pause size={15} aria-hidden="true" /> : <Play size={15} aria-hidden="true" />}
            {rule.isActive ? t('pause') : t('resume')}
          </button>
          <Link href={editRuleHref(rule.id)} role="menuitem" className={`${MENU_ITEM} border-y border-zinc-100`}>
            <Pencil size={15} aria-hidden="true" />
            {t('edit')}
            </Link>
          <button
            type="button"
            role="menuitem"
            onClick={async () => {
              if (await confirmDialog({
                title: t('deleteTitle', { name: rule.name }),
                description: t('thisAutoDmRuleWillBeDeleted'),
                confirmLabel: t('delete'),
                tone: 'danger',
              })) void run(() => deleteAutoDmRuleAction(rule.id))
            }}
            className={`${MENU_ITEM} text-red-600`}
          >
            <Trash2 size={15} aria-hidden="true" />
            {t('delete')}
            </button>
        </div>
      )}
    </div>
  )
}
