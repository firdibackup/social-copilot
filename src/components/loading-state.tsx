import type { ReactNode } from 'react'

/** Decorative placeholders; the enclosing loading region supplies the accessible status. */
export function Skeleton({ className = '' }: { className?: string }) {
  return <div aria-hidden="true" className={`skeleton rounded-md bg-zinc-100 ${className}`} />
}

type LoadingVariant = 'list' | 'page' | 'workspace' | 'line' | 'credits' | 'form' | 'settings' | 'gallery' | 'calendar' | 'analytics' | 'table' | 'editor' | 'chat'

interface LoadingStateProps {
  label?: string
  className?: string
  variant?: LoadingVariant
}

function TextLines() {
  return (
    <div className="min-w-0 flex-1 space-y-2">
      <Skeleton className="h-3 w-2/3 max-w-56" />
      <Skeleton className="h-3 w-full max-w-80" />
      <Skeleton className="h-3 w-2/5 max-w-40" />
    </div>
  )
}

function Rows({ count = 4 }: { count?: number }) {
  return (
    <div className="divide-y divide-hairline">
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="flex items-center gap-3 py-4">
          <Skeleton className="size-10 shrink-0 rounded-lg" />
          <TextLines />
        </div>
      ))}
    </div>
  )
}

function Heading() {
  return (
    <div className="space-y-3">
      <Skeleton className="h-7 w-40 max-w-full" />
      <Skeleton className="h-4 w-4/5 max-w-lg" />
    </div>
  )
}

function FormFields() {
  return (
    <div className="space-y-6">
      <Heading />
      <div className="grid gap-5 sm:grid-cols-2">
        {Array.from({ length: 4 }, (_, i) => (
          <div key={i} className="space-y-2">
            <Skeleton className="h-3 w-24" />
            <Skeleton className="h-11 w-full rounded-lg" />
          </div>
        ))}
      </div>
      <Skeleton className="h-24 w-full rounded-lg" />
      <Skeleton className="h-10 w-28 rounded-lg" />
    </div>
  )
}

function TableRows() {
  return (
    <div className="overflow-hidden rounded-xl border border-hairline">
      {Array.from({ length: 6 }, (_, i) => (
        <div key={i} className={`grid grid-cols-3 items-center gap-4 px-4 py-4 sm:grid-cols-4 ${i === 0 ? 'bg-bg' : 'border-t border-hairline'}`}>
          <Skeleton className="h-4 w-4/5" />
          <Skeleton className="h-4 w-3/5" />
          <Skeleton className="h-4 w-2/3" />
          <Skeleton className="hidden h-4 w-1/2 sm:block" />
        </div>
      ))}
    </div>
  )
}

function LoadingContent({ variant }: { variant: LoadingVariant }): ReactNode {
  switch (variant) {
    case 'workspace':
      return <div className="flex h-9 items-center gap-3 px-1"><Skeleton className="size-9 shrink-0 rounded-lg" /><div className="flex-1 space-y-2"><Skeleton className="h-3.5 w-24" /><Skeleton className="h-2.5 w-16" /></div></div>
    case 'line':
      return <Skeleton className="h-3.5 w-3/4" />
    case 'credits':
      return <div className="space-y-2 px-3 py-2"><div className="flex justify-between gap-4"><Skeleton className="h-3 w-14" /><Skeleton className="h-3 w-16" /></div><Skeleton className="h-1.5 w-full rounded-full" /></div>
    case 'form':
      return <FormFields />
    case 'settings':
      return <div className="space-y-4"><TextLines /><Skeleton className="h-10 w-40 max-w-full rounded-lg" /></div>
    case 'gallery':
      return <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">{Array.from({ length: 8 }, (_, i) => <div key={i} className="space-y-3"><Skeleton className="aspect-square w-full rounded-xl" /><Skeleton className="h-3 w-3/4" /><Skeleton className="h-3 w-1/2" /></div>)}</div>
    case 'calendar':
      return (
        <div className="space-y-6">
          <div className="flex flex-wrap items-center justify-between gap-4"><Heading /><Skeleton className="h-9 w-40 rounded-lg" /></div>
          <div className="overflow-hidden rounded-xl border border-hairline">
            <div className="grid grid-cols-7 gap-px bg-hairline">
              {Array.from({ length: 7 }, (_, i) => <div key={i} className="bg-paper p-2 sm:p-3"><Skeleton className="mx-auto h-3 w-2/3" /></div>)}
              {Array.from({ length: 35 }, (_, i) => <div key={i} className="min-h-20 space-y-4 bg-paper p-2 sm:min-h-28 sm:p-3"><Skeleton className="h-3 w-4" />{i % 4 === 1 && <Skeleton className="h-8 w-full" />}</div>)}
            </div>
          </div>
        </div>
      )
    case 'analytics':
      return <div className="space-y-6"><Heading /><Skeleton className="h-9 w-64 max-w-full rounded-lg" /><div className="grid grid-cols-2 gap-4 lg:grid-cols-4">{Array.from({ length: 4 }, (_, i) => <div key={i} className="space-y-4 rounded-xl border border-hairline p-5"><Skeleton className="h-3 w-2/3" /><Skeleton className="h-8 w-1/2" /><Skeleton className="h-3 w-4/5" /></div>)}</div><TableRows /></div>
    case 'table':
      return <div className="space-y-5"><Skeleton className="h-10 w-full max-w-sm rounded-lg" /><TableRows /></div>
    case 'editor':
    case 'chat':
      return (
        <div className="flex h-full min-h-0">
          <div className="hidden w-72 shrink-0 space-y-5 overflow-hidden border-r border-hairline p-5 md:block">
            <Skeleton className="h-10 w-full rounded-lg" /><Rows count={6} />
          </div>
          <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-6 overflow-hidden p-5 md:p-8">
            <Heading />
            {variant === 'editor' ? <div className="grid min-h-0 flex-1 gap-6 overflow-hidden lg:grid-cols-2"><div className="space-y-6"><Skeleton className="aspect-[4/5] w-full max-w-sm rounded-xl" /><Skeleton className="h-10 w-32" /></div><div className="hidden space-y-5 lg:block"><TextLines /><Skeleton className="h-32 w-full rounded-lg" /><TextLines /></div></div> : <div className="flex flex-1 flex-col gap-6 overflow-hidden pt-6"><Skeleton className="ml-auto h-16 w-2/3 max-w-sm rounded-xl" /><div className="w-4/5 max-w-lg space-y-3"><Skeleton className="h-4 w-full" /><Skeleton className="h-4 w-full" /><Skeleton className="h-4 w-3/5" /></div></div>}
            <Skeleton className="h-20 w-full shrink-0 rounded-xl" />
          </div>
        </div>
      )
    case 'page':
      return <div className="space-y-6"><Heading /><Rows count={5} /></div>
    default:
      return <Rows />
  }
}

/** Match the incoming layout, and disappear immediately when its data is ready. */
export function LoadingState({ label = 'Memuat…', className = '', variant = 'list' }: LoadingStateProps) {
  return (
    <div role="status" aria-label={label} className={`min-w-0 ${className}`}>
      <span className="sr-only">{label}</span>
      <div aria-hidden="true" className={variant === 'editor' || variant === 'chat' ? 'h-full' : undefined}>
        <LoadingContent variant={variant} />
      </div>
    </div>
  )
}
