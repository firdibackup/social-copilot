import { Newsreader } from 'next/font/google'
import Link from 'next/link'
import { CarouselyLogo } from '@/components/brand-mark'
import { SiteFooter } from '@/components/site-footer'
import { LegalNav } from './legal-nav'

/** A calm book serif for legal headings only; loaded here so the rest of the site never downloads it. */
const newsreader = Newsreader({
  variable: '--font-legal-serif',
  subsets: ['latin'],
  weight: ['400', '500', '600'],
  style: ['normal'],
})

/** Shared chrome for /privasi, /syarat, /refund and /hapus-data: a quiet header, one reading column, the site footer. */
export default function LegalLayout({ children }: LayoutProps<'/'>) {
  return (
    <div className={`${newsreader.variable} flex min-h-dvh flex-col bg-bg text-ink`}>
      <header className="border-b border-hairline bg-bg/85 backdrop-blur supports-[backdrop-filter]:sticky supports-[backdrop-filter]:top-0 supports-[backdrop-filter]:z-20">
        <div className="mx-auto flex w-full max-w-3xl items-center justify-between gap-3 px-4 py-3 sm:px-6 sm:py-4">
          <Link href="/" aria-label="Carousely" className="shrink-0 rounded-sm focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-focus">
            <CarouselyLogo size={26} className="max-[420px]:[&>span]:hidden" />
          </Link>
          <LegalNav />
        </div>
      </header>
      <main id="main-content" className="flex-1">
        {children}
      </main>
      <SiteFooter width="narrow" className="bg-paper" />
    </div>
  )
}
