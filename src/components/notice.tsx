import type { ReactNode } from 'react'

export type NoticeTone = 'success' | 'warning' | 'error'

const NOTICE_CLASS: Record<NoticeTone, string> = {
  success: 'border-emerald-200 bg-emerald-50 text-emerald-800',
  warning: 'border-amber-200 bg-amber-50 text-amber-800',
  error: 'border-red-200 bg-red-50 text-red-800',
}

export function Notice({ tone, children }: { tone: NoticeTone; children: ReactNode }) {
  return (
    <p role={tone === 'success' ? 'status' : 'alert'} className={`rounded-lg border px-4 py-3 text-sm ${NOTICE_CLASS[tone]}`}>
      {children}
    </p>
  )
}
