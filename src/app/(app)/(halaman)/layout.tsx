import type { ReactNode } from 'react'
import { LoaderHold } from '@/components/brand-mark'

/** Ordinary pages scroll as a whole inside the main card. Buat sits outside this group: it scrolls per column. */
export default function HalamanLayout({ children }: { children: ReactNode }) {
  return (
    <div className="relative h-full">
      <div className="h-full overflow-y-auto px-4 py-6 md:px-8 md:py-8">{children}</div>
      <LoaderHold />
    </div>
  )
}
