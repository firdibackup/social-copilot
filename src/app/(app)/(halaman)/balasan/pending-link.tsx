'use client'

import { useTranslations } from 'next-intl'

import { LoaderCircle } from 'lucide-react'
import Link, { useLinkStatus } from 'next/link'
import type { ComponentProps, ReactNode } from 'react'

type Props = Omit<ComponentProps<typeof Link>, 'children'> & { children: ReactNode }

export function PendingLink({ children, className = '', ...props }: Props) {
  return (
    <Link {...props} className={`${className} has-[[aria-busy=true]]:cursor-wait has-[[aria-busy=true]]:opacity-60`}>
      <Pending>{children}</Pending>
    </Link>
  )
}

function Pending({ children }: { children: ReactNode }) {
  const t = useTranslations('inbox.pendingLink')
  const { pending } = useLinkStatus()
  return (
    <span aria-busy={pending} className="contents">
      {children}
      {pending && <><LoaderCircle size={14} className="ml-1 inline animate-spin motion-reduce:animate-none" aria-hidden="true" /><span className="sr-only">{t('loadingReplies')}</span></>}
    </span>
  )
}
