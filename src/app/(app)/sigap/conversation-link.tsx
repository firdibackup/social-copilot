'use client'

import Link from 'next/link'
import type { ComponentProps } from 'react'

/** Only the selected conversation changes; useSearchParams updates without another server render. */
export function ConversationLink(props: ComponentProps<typeof Link>) {
  return <Link {...props} prefetch={false} onNavigate={(event) => {
    event.preventDefault()
    window.history.pushState(null, '', String(props.href))
  }} />
}
