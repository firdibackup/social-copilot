'use client'

import { LoaderCircle } from 'lucide-react'
import Link, { useLinkStatus } from 'next/link'
import type { ReactNode } from 'react'

export function CalendarPeriodLink({ href, label, children }: { href: string; label: string; children: ReactNode }) {
  return (
    <Link href={href} aria-label={label} className="rounded-md p-1.5 hover:bg-zinc-100 has-[[aria-busy=true]]:cursor-wait has-[[aria-busy=true]]:opacity-60">
      <PendingIndicator>{children}</PendingIndicator>
    </Link>
  )
}

function PendingIndicator({ children }: { children: ReactNode }) {
  const { pending } = useLinkStatus()
  return (
    <span aria-busy={pending} className="grid place-items-center">
      {pending ? <><LoaderCircle size={18} className="animate-spin" aria-hidden="true" /><span className="sr-only">Memuat kalender</span></> : children}
    </span>
  )
}
