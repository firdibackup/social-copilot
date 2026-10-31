'use client'

import Link, { useLinkStatus } from 'next/link'
import type { ReactNode } from 'react'
import { PiCircleNotch } from 'react-icons/pi'
import idCalendar from '../../../../../messages/id/calendar.json'

export function CalendarPeriodLink({ href, label, loadingLabel = idCalendar.page.loadingPeriod, children }: { href: string; label: string; loadingLabel?: string; children: ReactNode }) {
  return (
    <Link href={href} aria-label={label} className="grid h-11 min-w-11 place-items-center rounded-lg text-ink-muted transition-colors duration-150 hover:bg-zinc-100 hover:text-ink has-[[aria-busy=true]]:cursor-wait has-[[aria-busy=true]]:opacity-60">
      <PendingIndicator loadingLabel={loadingLabel}>{children}</PendingIndicator>
    </Link>
  )
}

function PendingIndicator({ children, loadingLabel }: { children: ReactNode; loadingLabel: string }) {
  const { pending } = useLinkStatus()
  return (
    <span aria-busy={pending} className="grid place-items-center">
      {pending ? <><PiCircleNotch size={18} className="animate-spin motion-reduce:animate-none" aria-hidden="true" /><span className="sr-only">{loadingLabel}</span></> : children}
    </span>
  )
}
