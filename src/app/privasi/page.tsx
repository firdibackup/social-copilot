import { getTranslations, getLocale } from 'next-intl/server'
import { intlLocale } from '@/i18n/locale-config'
import type { Metadata } from 'next'
import { connection } from 'next/server'
import { Suspense, type ReactNode } from 'react'
import { getBillingCatalog } from '@/lib/billing-catalog'
import { DEFAULT_CATALOG } from '@/lib/billing-catalog-options'
import { formatRupiah, type Plan } from '@/lib/billing-options'

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('legal.privacy')
  return { title: t('title') }
}

const APP_NAME = 'Carousely'
const CONTACT_EMAIL = 'creative.karsindo@gmail.com'

const DELETE_MAIL = `mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent('Hapus data')}`

/** Public (PUBLIC_PATHS in proxy.ts) for the Meta app's Privacy Policy, Terms of Service and data deletion URLs. */
export default async function PrivasiPage() {
  const t = await getTranslations('legal')
  const rich = {
    app: APP_NAME, email: CONTACT_EMAIL, date: t('privacy.date'),
    strong: (chunks: ReactNode) => <strong>{chunks}</strong>,
    emailLink: (chunks: ReactNode) => <a href={`mailto:${CONTACT_EMAIL}`} className="underline">{chunks}</a>,
    deleteLink: (chunks: ReactNode) => <a href={DELETE_MAIL} className="underline">{chunks}</a>,
    deletionLink: (chunks: ReactNode) => <a href="#hapus-data" className="underline">{chunks}</a>,
  }
  return (
    <main className="mx-auto max-w-2xl space-y-10 px-4 py-10 text-zinc-800">
      <header className="space-y-2">
        <h1 className="text-3xl font-semibold tracking-tight text-zinc-900">{t.rich('privacy.paragraph1', rich)}</h1>
        <p className="text-sm text-zinc-500">{t.rich('privacy.paragraph2', rich)}</p>
        <nav aria-label={t('privacy.contents')} className="text-sm">
          <a href="#privasi" className="underline">{t('privacy.title')}</a> ·{' '}
          <a href="#ketentuan" className="underline">{t('privacy.terms')}</a> ·{' '}
          <a href="#hapus-data" className="underline">{t('privacy.deletion')}</a>
        </nav>
      </header>

      <Section id="privasi" title={t('privacy.title')}>
        <p>{t.rich('privacy.paragraph3', rich)}</p>

        <h3 className="font-semibold text-zinc-900">{t.rich('privacy.paragraph4', rich)}</h3>
        <ul className="list-disc space-y-2 pl-5">
          <li>{t.rich('privacy.paragraph5', rich)}</li>
          <li>{t.rich('privacy.paragraph6', rich)}</li>
          <li>{t.rich('privacy.paragraph7', rich)}</li>
          <li>{t.rich('privacy.paragraph8', rich)}</li>
          <li>{t.rich('privacy.paragraph9', rich)}</li>
          <li>{t.rich('privacy.paragraph10', rich)}</li>
          <li>{t.rich('privacy.paragraph11', rich)}</li>
          <li>{t.rich('privacy.paragraph12', rich)}</li>
          <li>{t.rich('privacy.paragraph13', rich)}</li>
          <li>{t.rich('privacy.paragraph14', rich)}</li>
          <li>{t.rich('privacy.paragraph15', rich)}</li>
        </ul>

        <h3 className="font-semibold text-zinc-900">{t.rich('privacy.paragraph16', rich)}</h3>
        <p>{t.rich('privacy.paragraph17', rich)}</p>

        <h3 className="font-semibold text-zinc-900">{t.rich('privacy.paragraph18', rich)}</h3>
        <ul className="list-disc space-y-2 pl-5">
          <li>{t.rich('privacy.paragraph19', rich)}</li>
          <li>{t.rich('privacy.paragraph20', rich)}</li>
          <li>{t.rich('privacy.paragraph21', rich)}</li>
        </ul>
        <p>{t.rich('privacy.paragraph22', rich)}</p>

        <h3 className="font-semibold text-zinc-900">{t.rich('privacy.paragraph23', rich)}</h3>
        <p>{t.rich('privacy.paragraph24', rich)}</p>
        <p>{t.rich('privacy.paragraph25', rich)}</p>

        <h3 className="font-semibold text-zinc-900">{t.rich('privacy.paragraph26', rich)}</h3>
        <p>{t.rich('privacy.paragraph27', rich)}</p>
      </Section>

      <Section id="ketentuan" title={t('privacy.terms')}>
        <ul className="list-disc space-y-2 pl-5">
          <li>{t.rich('privacy.paragraph28', rich)}</li>
          <li>{t.rich('privacy.paragraph29', rich)}</li>
          <Suspense fallback={<li>{t.rich('privacy.paragraph30', rich)}</li>}>
            <PlanTerms />
          </Suspense>
          <li>{t.rich('privacy.paragraph31', rich)}</li>
          <li>{t.rich('privacy.paragraph32', rich)}</li>
          <li>{t.rich('privacy.paragraph33', rich)}</li>
        </ul>
      </Section>

      <Section id="hapus-data" title={t('privacy.deletion')}>
        <p>{t.rich('privacy.paragraph34', rich)}</p>
        <ol className="list-decimal space-y-2 pl-5">
          <li>{t.rich('privacy.paragraph35', rich)}</li>
          <li>{t.rich('privacy.paragraph36', rich)}</li>
        </ol>
        <p>{t.rich('privacy.paragraph37', rich)}</p>
        <p>{t.rich('privacy.paragraph38', rich)}</p>
      </Section>
    </main>
  )
}

function Section({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <section id={id} className="scroll-mt-6 space-y-4 leading-relaxed">
      <h2 className="text-xl font-semibold text-zinc-900">{title}</h2>
      {children}
    </section>
  )
}

/** The plan as the admin set it (/admin/pengaturan). */
async function PlanTerms() {
  await connection()
  const billing = await getBillingCatalog().catch(() => ({ catalog: DEFAULT_CATALOG }))
  return <>{billing.catalog.plans.filter((plan) => plan.active).map((plan) => <PlanTermsText key={plan.id} plan={plan} />)}</>
}

async function PlanTermsText({ plan }: { plan: Plan }) {
  const t = await getTranslations('legal.privacy')
  const locale = await getLocale()
  return (
    <>
      <li>
        {t('planPrice', { name: plan.name, price: formatRupiah(plan.priceIdr, locale) })}
      </li>
      <li>
        {t('planCredits', { name: plan.name, credits: plan.credits.toLocaleString(intlLocale(locale)) })}
      </li>
    </>
  )
}
