'use client'

import { useLocale, useTranslations } from 'next-intl'

import { useActionState, useEffect, useState } from 'react'
import { Notice } from '@/components/notice'
import { MIN_PRICE_IDR, type BillingCatalog, type CatalogPlan } from '@/lib/billing-catalog-options'
import { formatRupiah } from '@/lib/billing-options'
import { BUTTON, CARD, CARD_TITLE, FIELD, HINT, LABEL, PRIMARY_BUTTON } from '../ui'
import { saveCatalogAction } from './billing-actions'

export function BillingForm({ catalog, version }: { catalog: BillingCatalog; version: number }) {
  const locale = useLocale()

  const t = useTranslations('admin')

  const RATE_LABELS: Record<string, string> = {
  image: t('billing_form.newImagePerSlide'), content: t('billing_form.contentLayoutAndCaption'), content_slide: t('billing_form.alreadyPaidSlides'),
  slide_edit: t('billing_form.editImage'), caption_edit: t('billing_form.editCaption'), threads_write: t('billing_form.writeThreads'), threads_edit: t('billing_form.editThreads'), content_ideas: t('billing_form.contentIdeas'), content_script: t('billing_form.script'),
  brand_profile: t('billing_form.brandProfile'), brand_visual: t('billing_form.brandVisuals'), brand_strategy: t('billing_form.brandStrategy'), website_catalog: t('billing_form.websiteCatalog'),
  asset_tags: t('billing_form.assetTagsPerPhoto'), reply_draft: t('billing_form.replyDraft'), template_analysis: t('billing_form.adminTemplateAnalysis'),
  reference_labels: t('billing_form.referenceCategoriesFromGrid'),
  chat: t('billing_form.mimoChatPerMessage'), deep_search: t('billing_form.researchInAdditionToDailyLimit'), chat_summary: t('billing_form.conversationSummary'),
}

  const [config, setConfig] = useState(catalog)
  const [state, action, pending] = useActionState(saveCatalogAction, { error: null, success: null })
  const updatePlan = (index: number, patch: Partial<CatalogPlan>) => setConfig((current) => ({ ...current,
    plans: current.plans.map((plan, i) => i === index ? { ...plan, ...patch } : plan) }))
  // This page has a second form below with its own save button; edits here are lost if only that one is pressed.
  const dirty = JSON.stringify(config) !== JSON.stringify(catalog)
  useEffect(() => {
    if (!dirty) return
    const warn = (event: BeforeUnloadEvent) => event.preventDefault()
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [dirty])
  return (
    <form action={action} className="space-y-5">
      <input type="hidden" name="version" value={version} />
      <input type="hidden" name="config" value={JSON.stringify(config)} />
      <header className="space-y-1">
        <h2 className="text-xl font-semibold text-zinc-900">{t('billing_form.plansCredits')}</h2>
        <p className={HINT}>{t('billing_form.versionHint', { version })}</p>
      </header>
      {config.plans.map((plan, index) => (
        <fieldset key={index} className={CARD} disabled={pending}>
          <legend className={CARD_TITLE}>{plan.name || t('billing_form.newPlan')} · {formatRupiah(plan.priceIdr, locale)}{t('billing_form.month')}</legend>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className={LABEL}>{t('billing_form.planId')}<input className={FIELD} value={plan.id} required pattern="[a-z][a-z0-9-]{0,39}" onChange={(e) => updatePlan(index, { id: e.target.value })} /></label>
            <label className={LABEL}>{t('billing_form.name')}<input className={FIELD} value={plan.name} required maxLength={80} onChange={(e) => updatePlan(index, { name: e.target.value })} /></label>
            <label className={`${LABEL} sm:col-span-2`}>{t('billing_form.description')}<input className={FIELD} value={plan.description} maxLength={250} onChange={(e) => updatePlan(index, { description: e.target.value })} /></label>
            {([['priceIdr', t('billing_form.monthlyPriceMin', { v0: formatRupiah(MIN_PRICE_IDR, locale) }), MIN_PRICE_IDR], ['credits', t('billing_form.creditsPerMonth'), 1], ['chatDaily', t('billing_form.chatsPerDay'), 0], ['researchDaily', t('billing_form.researchPerDay'), 0]] as const).map(([key, label, min]) => (
              <label key={key} className={LABEL}>{label}<input className={FIELD} type="number" min={min} step={1} required value={plan[key]} onChange={(e) => updatePlan(index, { [key]: Number(e.target.value) })} /></label>
            ))}
          </div>
          <div className="flex flex-wrap gap-4 text-sm">
            {([['active', t('billing_form.availableForPurchase')], ['prioritySupport', t('billing_form.priority1On1Support')], ['earlyAccess', t('billing_form.earlyAccessToNewFeatures')]] as const).map(([key, label]) => (
              <label key={key} className="flex items-center gap-2"><input type="checkbox" checked={plan[key]} onChange={(e) => updatePlan(index, { [key]: e.target.checked })} />{label}</label>
            ))}
          </div>
          <p className={HINT}>{t('billing_form.toArchiveAPlanTurnOffAvailable')}</p>
        </fieldset>
      ))}
      <button className={BUTTON} type="button" disabled={pending || config.plans.length >= 20} onClick={() => setConfig((current) => ({ ...current, plans: [...current.plans,
        { ...current.plans[0], id: `paket-${current.plans.length + 1}`, name: t('billing_form.newPlan'), active: false }] }))}>{t('billing_form.addPlan')}</button>
      <fieldset className={CARD} disabled={pending}>
        <legend className={CARD_TITLE}>{t('billing_form.durationDiscounts')}</legend>
        <div className="grid gap-4 sm:grid-cols-2">
          {config.durations.map((duration, index) => (
            <label className={LABEL} key={duration.months}>{duration.months} {t('billing_form.monthsDiscount')}<input className={FIELD} type="number" min={0} max={90} step={1} value={duration.discount} onChange={(e) => setConfig((current) => ({ ...current,
                durations: current.durations.map((item, i) => i === index ? { ...item, discount: Number(e.target.value) } : item) }))} />
            </label>
          ))}
        </div>
        <p className={HINT}>{t('billing_form.paidUpfrontQuotaRenewsMonthlyOnThe')}</p>
      </fieldset>
      <fieldset className={CARD} disabled={pending}>
        <legend className={CARD_TITLE}>{t('billing_form.creditCostPerFeature')}</legend>
        <div className="grid gap-4 sm:grid-cols-2">
          {Object.entries(config.rates).map(([key, rate]) => (
            <label className={LABEL} key={key}>{RATE_LABELS[key] ?? key}<input className={FIELD} type="number" min={0} max={10000} step={1} required
              readOnly={key === 'content_slide' || key === 'template_analysis'} value={rate} onChange={(e) => setConfig((current) => ({ ...current, rates: { ...current.rates, [key]: Number(e.target.value) } }))} /></label>
          ))}
        </div>
        <p className={HINT}>{t('billing_form.estimated5SlideCarousel')} {config.rates.content + 5 * config.rates.image} {t('billing_form.creditsEditsAndScriptsAreChargedSeparately')}</p>
      </fieldset>
      <fieldset className={CARD} disabled={pending}>
        <legend className={CARD_TITLE}>{t('billing_form.prioritySupport')}</legend>
        <label className={LABEL}>{t('billing_form.whatsappOrSchedulingLink')}<input type="url" placeholder="https://wa.me/62…" className={FIELD} value={config.supportUrl} onChange={(e) => setConfig((current) => ({ ...current, supportUrl: e.target.value }))} /></label>
        <label className={LABEL}>{t('billing_form.supportHours')}<input className={FIELD} placeholder={t('billing_form.mondayFriday09001700Wib')} value={config.supportHours} onChange={(e) => setConfig((current) => ({ ...current, supportHours: e.target.value }))} /></label>
      </fieldset>
      {state.error && <Notice tone="error">{state.error}</Notice>}
      {state.success && !dirty && <Notice tone="success">{state.success}</Notice>}
      {dirty && !pending && <Notice tone="warning">{t('billing_form.planCreditChangesArenTSavedYet')}</Notice>}
      <button className={PRIMARY_BUTTON} type="submit" disabled={pending}>{pending ? t('billing_form.saving') : t('billing_form.savePlansCredits')}</button>
    </form>
  )
}
