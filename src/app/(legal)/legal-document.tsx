import Link from 'next/link'
import { connection } from 'next/server'
import { getLocale, getTranslations } from 'next-intl/server'
import { Suspense, type ReactNode } from 'react'
import { intlLocale, resolveLocale } from '@/i18n/locale-config'
import { getBillingCatalog } from '@/lib/billing-catalog'
import { DEFAULT_CATALOG } from '@/lib/billing-catalog-options'
import { formatRupiah } from '@/lib/billing-options'
import { COMPANY, supportMailto } from '@/lib/company'
import type { LegalDocName } from './legal-pages'

type Block =
  | string
  | string[]
  | { h: string }
  | { ol: string[] }
  | { plans: true }
  | { contact: true }
interface LegalDoc {
  title: string
  intro: Block[]
  sections: { id?: string; title: string; blocks: Block[] }[]
}

type Translator = Awaited<ReturnType<typeof getTranslations<'legal'>>>
type Rich = Parameters<Translator['rich']>[1]
/** legal.json is read structurally, so its paths are only known at runtime. */
type Key = Parameters<Translator['rich']>[0]

const linkClass =
  'font-medium text-primary-hover underline decoration-primary/35 decoration-1 underline-offset-[3px] transition-colors hover:decoration-primary focus-visible:rounded-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus'

function richValues(): Rich {
  const page = (href: string) => function PageLink(chunks: ReactNode) { return <Link href={href} className={linkClass}>{chunks}</Link> }
  const external = (href: string) => function ExternalLink(chunks: ReactNode) { return <a href={href} className={linkClass}>{chunks}</a> }
  return {
    app: 'Carousely',
    email: COMPANY.email,
    phone: COMPANY.phone,
    b: (chunks: ReactNode) => <strong className="font-semibold text-ink">{chunks}</strong>,
    privacy: page('/privasi'),
    terms: page('/syarat'),
    refund: page('/refund'),
    deletion: page('/hapus-data'),
    settings: page('/pengaturan'),
    mail: external(supportMailto()),
    deleteMail: external(supportMailto('Permintaan Penghapusan Data')),
    refundMail: external(supportMailto('Permintaan Refund')),
    phoneLink: function PhoneLink(chunks: ReactNode) { return <a href={COMPANY.phoneHref} className={`${linkClass} whitespace-nowrap`}>{chunks}</a> },
  }
}

const slug = (text: string) =>
  text.toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')

/** Renders one document from messages/<locale>/legal.json, e.g. `<LegalDocument doc="refund" />`. */
export async function LegalDocument({ doc }: { doc: LegalDocName }) {
  const t = await getTranslations('legal')
  const data = t.raw(doc as Parameters<Translator['raw']>[0]) as LegalDoc
  const rich = richValues()
  const text = (path: string) => t.rich(path as Key, rich)

  return (
    <article className="mx-auto w-full max-w-3xl px-5 pt-12 pb-20 text-[15.5px] leading-[1.75] text-zinc-700 sm:px-6 sm:pt-16 sm:pb-24 sm:text-base">
      <header className="mb-10 border-b border-hairline pb-8 sm:mb-12 sm:pb-10">
        <h1 className="font-[family-name:var(--font-legal-serif)] text-[2.15rem] leading-[1.12] font-medium tracking-[-0.015em] text-balance text-ink sm:text-[2.9rem]">
          {data.title}
        </h1>
        <p className="mt-4 text-[13px] tracking-wide text-ink-soft">
          {t('layout.updated', { date: t('layout.date') })}
        </p>
        {data.intro.length > 0 && (
          <div className="mt-6 space-y-4 text-[1.0625rem] text-zinc-600">
            <Blocks blocks={data.intro} base={`${doc}.intro`} text={text} />
          </div>
        )}
      </header>

      <div className="space-y-11 sm:space-y-12">
        {data.sections.map((section, index) => (
          <section key={index} id={section.id ?? slug(section.title)} className="scroll-mt-24 space-y-4">
            <h2 className="group font-[family-name:var(--font-legal-serif)] text-[1.45rem] leading-snug font-medium tracking-[-0.01em] text-ink sm:text-[1.65rem]">
              <span className="mr-2 text-primary tabular-nums">{index + 1}.</span>
              {text(`${doc}.sections.${index}.title`)}
            </h2>
            <Blocks blocks={section.blocks} base={`${doc}.sections.${index}.blocks`} text={text} />
          </section>
        ))}
      </div>
    </article>
  )
}

function Blocks({ blocks, base, text }: { blocks: Block[]; base: string; text: (path: string) => ReactNode }) {
  return blocks.map((block, index) => {
    const path = `${base}.${index}`
    if (typeof block === 'string') return <p key={index}>{text(path)}</p>
    if (Array.isArray(block)) {
      return (
        <ul key={index} className="list-none space-y-2.5 pl-0">
          {block.map((_, item) => <Bullet key={item}>{text(`${path}.${item}`)}</Bullet>)}
        </ul>
      )
    }
    if ('h' in block) {
      return <h3 key={index} className="pt-3 text-[1.0625rem] font-semibold text-ink">{text(`${path}.h`)}</h3>
    }
    if ('ol' in block) {
      return (
        <ol key={index} className="space-y-3 pl-0">
          {block.ol.map((_, item) => (
            <li key={item} className="flex gap-3.5">
              <span aria-hidden="true" className="mt-[0.2em] inline-flex size-6 shrink-0 items-center justify-center rounded-full bg-accent-soft text-[12px] font-semibold text-primary-hover tabular-nums">
                {item + 1}
              </span>
              <span className="min-w-0">{text(`${path}.ol.${item}`)}</span>
            </li>
          ))}
        </ol>
      )
    }
    if ('plans' in block) return <PlanBlock key={index} />
    return <ContactBlock key={index} />
  })
}

function Bullet({ children }: { children: ReactNode }) {
  return (
    <li className="relative pl-6 before:absolute before:top-[0.72em] before:left-1.5 before:size-1.5 before:rounded-full before:bg-primary/55">
      {children}
    </li>
  )
}

function ContactBlock() {
  return (
    <address className="rounded-xl border border-hairline bg-paper px-5 py-4 not-italic shadow-[0_1px_2px_rgba(23,24,39,0.04)]">
      <strong className="block font-semibold text-ink">{COMPANY.name}</strong>
      {COMPANY.address.map((line) => <span key={line} className="block text-zinc-600">{line}</span>)}
      <span className="mt-2 flex flex-wrap items-baseline gap-x-2">
        <a href={COMPANY.phoneHref} className={`${linkClass} whitespace-nowrap`}>{COMPANY.phone}</a>
        <span aria-hidden="true" className="text-ink-soft">·</span>
        <a href={supportMailto()} className={linkClass}>{COMPANY.email}</a>
      </span>
    </address>
  )
}

async function PlanBlock() {
  const t = await getTranslations('legal')
  return (
    <Suspense fallback={<ul className="list-none space-y-2.5 pl-0"><Bullet>{t('layout.planFallback')}</Bullet></ul>}>
      <PlanTerms />
    </Suspense>
  )
}

/** The plans as the admin set them (/admin/pengaturan); read per request. */
async function PlanTerms() {
  await connection()
  const [t, locale, billing] = await Promise.all([
    getTranslations('legal'),
    getLocale().then(resolveLocale),
    getBillingCatalog().catch(() => ({ catalog: DEFAULT_CATALOG })),
  ])
  return (
    <ul className="list-none space-y-2.5 pl-0">
      {billing.catalog.plans.filter((plan) => plan.active).flatMap((plan) => [
        <Bullet key={`${plan.id}-price`}>{t('layout.planPrice', { name: plan.name, price: formatRupiah(plan.priceIdr, locale) })}</Bullet>,
        <Bullet key={`${plan.id}-credits`}>{t('layout.planCredits', { name: plan.name, credits: plan.credits.toLocaleString(intlLocale(locale)) })}</Bullet>,
      ])}
    </ul>
  )
}
