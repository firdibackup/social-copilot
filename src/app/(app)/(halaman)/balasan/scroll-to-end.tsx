'use client'

import { useEffect, useRef, type ReactNode } from 'react'

/** A thread's message list, scrolled to the newest message when it opens and when one arrives. */
export function ScrollToEnd({ children, className, count }: { children: ReactNode; className?: string; count: number }) {
  const list = useRef<HTMLOListElement>(null)
  useEffect(() => {
    const element = list.current
    if (element) element.scrollTop = element.scrollHeight
  }, [count])
  return (
    <ol ref={list} className={className}>
      {children}
    </ol>
  )
}
