import type { Metadata } from 'next'
import { connection } from 'next/server'
import { Suspense } from 'react'
import { LoadingState } from '@/components/loading-state'
import { Notice } from '@/components/notice'
import { DEFAULT_IMAGE_MODEL, defaultImageModel, getAppSettings } from '@/lib/app-settings'
import { requireAdmin } from '@/lib/auth'
import { describeError } from '@/lib/errors'
import { listModels } from '@/lib/nine-router'
import { SettingsForm } from './settings-form'
import { BillingForm } from './billing-form'
import { getBillingCatalog } from '@/lib/billing-catalog'

export const metadata: Metadata = { title: 'Pengaturan · Admin' }

/** The text model verified on 2026-10-16, offered as a one-click choice beside the Claude models 9Router lists. */
const VERIFIED_TEXT_MODEL = 'cc/claude-haiku-4-5-20251001'
const MAX_PRESETS = 4

export default function AdminPengaturanPage() {
  return (
    <Suspense fallback={<LoadingState variant="form" className="max-w-3xl" label="Memuat pengaturan…" />}>
      <Settings />
    </Suspense>
  )
}

async function Settings() {
  await connection()
  await requireAdmin()
  const settings = await getAppSettings()
  const billing = await getBillingCatalog().catch(() => null)
  const envTextModel = process.env.ROUTER_MODEL?.trim() || null
  let models: string[] = []
  let modelsError: string | null = null
  try {
    models = await listModels()
  } catch (error) {
    console.error('[admin] daftar model 9Router gagal:', describeError(error))
    modelsError = 'Daftar model dari 9Router tidak bisa diambil, tapi id model tetap bisa diketik manual.'
  }
  // /models doesn't list image models (they are in the 9Router dashboard), so the default is the only sure one.
  const imageModels = [...new Set([DEFAULT_IMAGE_MODEL, ...models.filter((model) => /image|dall-?e|imagen/i.test(model))])]
  const textModels = models.filter((model) => !imageModels.includes(model))
  const presets = [...new Set([VERIFIED_TEXT_MODEL, ...textModels.filter((model) => /claude/i.test(model))])].slice(0, MAX_PRESETS)

  return (
    <div className="max-w-3xl space-y-4">
      {billing ? <BillingForm key={billing.version} {...billing} /> : <Notice tone="warning">Jalankan migrasi billing_catalog untuk mengatur paket Pro/Max.</Notice>}
      {modelsError && <Notice tone="warning">{modelsError}</Notice>}
      <SettingsForm
        values={{
          textModel: settings.textModel ?? '',
          imageModel: settings.imageModel ?? '',
          planName: settings.plan.name,
          planPrice: settings.plan.priceIdr,
          planDays: settings.plan.days,
          planCredits: settings.plan.credits,
        }}
        defaults={{ textModel: envTextModel, imageModel: defaultImageModel() }}
        textModels={textModels}
        textPresets={presets}
        imageModels={imageModels}
        updatedAt={settings.updatedAt?.toISOString() ?? null}
      />
    </div>
  )
}
