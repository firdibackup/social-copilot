import { useTranslations } from 'next-intl'
import Link from 'next/link'
import type { ReactNode } from 'react'
import { CarouselyLogo } from '@/components/brand-mark'
import { COMPANY, supportMailto } from '@/lib/company'

interface SiteFooterProps {
  /** Extra controls under the tagline, e.g. the landing page's motion toggle. */
  extra?: ReactNode
  /** Width of the content column; the legal pages use a narrower one. */
  width?: 'wide' | 'narrow'
  className?: string
}

type FooterLink = { href: string; label: string }

/**
 * The public site footer, shared by the landing page and the legal pages:
 * brand + link columns, then the company address and contact, then the copyright line.
 * Works as a server or a client component (it only reads `common` messages).
 */
export function SiteFooter({ extra, width = 'wide', className = '' }: SiteFooterProps) {
  const t = useTranslations('common.site')
  const columns: { title: string; links: FooterLink[] }[] = [
    {
      title: t('company'),
      links: [
        { href: '/#harga', label: t('pricing') },
        { href: supportMailto(), label: t('contact') },
      ],
    },
    {
      title: t('product'),
      links: [
        { href: '/#fitur', label: t('features') },
        { href: '/#tur-fitur', label: t('workflow') },
        { href: '/#faq', label: t('faq') },
        { href: '/masuk', label: t('login') },
      ],
    },
    {
      title: t('legal'),
      links: [
        { href: '/privasi', label: t('privacy') },
        { href: '/syarat', label: t('terms') },
        { href: '/refund', label: t('refund') },
        { href: '/hapus-data', label: t('deletion') },
      ],
    },
  ]
  const inner = width === 'wide' ? 'max-w-[1200px] px-7 max-[760px]:px-6' : 'max-w-3xl px-6'
  const linkClass =
    'rounded-sm text-ink-muted transition-colors duration-150 hover:text-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus'

  return (
    <footer className={`border-t border-hairline text-[13px] ${className}`}>
      <div className={`mx-auto w-full ${inner}`}>
        <div className="flex flex-col gap-10 py-12 md:flex-row md:justify-between md:gap-16">
          <div className="max-w-[17rem] space-y-3">
            <Link href="/" className="inline-flex rounded-sm focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-focus">
              <CarouselyLogo size={28} />
            </Link>
            <p className="leading-relaxed text-ink-muted">{t('tagline')}</p>
            {extra}
          </div>

          <nav aria-label={t('footerNav')} className="grid grid-cols-2 gap-x-10 gap-y-8 min-[601px]:grid-cols-3 md:gap-x-16">
            {columns.map((column) => (
              <div key={column.title}>
                <h2 className="mb-3.5 text-[11px] font-semibold tracking-[0.08em] text-ink-soft uppercase">{column.title}</h2>
                <ul className="space-y-2.5">
                  {column.links.map((link) => (
                    <li key={link.href}>
                      {link.href.startsWith('mailto:') ? (
                        <a href={link.href} className={linkClass}>{link.label}</a>
                      ) : (
                        <Link href={link.href} className={linkClass}>{link.label}</Link>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </nav>
        </div>

        <div className="flex flex-col gap-6 border-t border-hairline py-8 md:flex-row md:items-end md:justify-between">
          <address aria-label={t('address')} className="max-w-md leading-relaxed text-ink-muted not-italic">
            <strong className="block font-semibold text-ink">{COMPANY.name}</strong>
            {COMPANY.address.map((line) => (
              <span key={line} className="block">{line}</span>
            ))}
            <span className="mt-1.5 flex flex-wrap items-baseline gap-x-2">
              <a href={COMPANY.phoneHref} className={`${linkClass} whitespace-nowrap`}>{COMPANY.phone}</a>
              <span aria-hidden="true" className="text-ink-soft">·</span>
              <a href={supportMailto()} className={linkClass}>{COMPANY.email}</a>
            </span>
          </address>
          <p className="text-[12px] text-ink-soft">{t('copyright', { year: COMPANY.copyrightYear })}</p>
        </div>
      </div>
    </footer>
  )
}
