'use client'

import { useEffect, type ReactNode } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { saveBeforeNavigation } from './use-save-before-navigation'

export function WorkspaceFrame({ list, children }: { list: ReactNode; children: ReactNode }) {
  const params = useSearchParams()
  const router = useRouter()
  const editing = ['id', 'ide', 'baru', 'tanggal', 'slot'].some((key) => params.get(key))
  useEffect(() => {
    let navigating = false
    const onClick = (event: MouseEvent) => {
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return
      const link = event.target instanceof Element ? event.target.closest('a[href]') : null
      if (!(link instanceof HTMLAnchorElement) || link.target || link.hasAttribute('download')) return
      const url = new URL(link.href)
      if (url.origin !== location.origin || (url.pathname === location.pathname && url.search === location.search)) return
      event.preventDefault()
      event.stopPropagation()
      if (navigating) return
      navigating = true
      void saveBeforeNavigation().then((saved) => {
        if (!saved) return
        // Same-workspace selections only change the browser query; cached data renders synchronously.
        if (url.pathname === '/buat') window.history.pushState(null, '', `${url.pathname}${url.search}${url.hash}`)
        else router.push(`${url.pathname}${url.search}${url.hash}`)
      }).finally(() => { navigating = false })
    }
    document.addEventListener('click', onClick, true)
    return () => document.removeEventListener('click', onClick, true)
  }, [router])
  return (
    <div className="flex h-full min-h-0">
      {list}
      <div className={`${editing ? 'flex' : 'hidden md:flex'} min-h-0 min-w-0 flex-1 flex-col`}>{children}</div>
    </div>
  )
}
