import { getTranslations } from 'next-intl/server'
import { Notice } from '@/components/notice'
import { requireUser } from '@/lib/auth'
import { getConnectedAccountId } from '@/lib/connection'
import { getDensityDefault } from '@/lib/density'
import { DEFAULT_DENSITY, type TextDensity } from '@/lib/density-options'
import { ConfigError, describeError } from '@/lib/errors'
import { DensityPicker } from './density-picker'

/** Kepadatan teks: the account's default for new posts in Buat; every post can still pick another. */
export async function DensitySettings() {
  const t = await getTranslations('settings')
  const userId = await requireUser()
  let state: { accountId: string | null; density: TextDensity }
  try {
    const accountId = await getConnectedAccountId(userId)
    state = { accountId, density: accountId ? await getDensityDefault(userId, accountId) : DEFAULT_DENSITY }
  } catch (error) {
    console.error('[pengaturan] kepadatan teks gagal dimuat:', describeError(error))
    return <Notice tone="warning">{error instanceof ConfigError ? t('loadErrors.configuration', { message: error.message }) : t('loadErrors.database')}</Notice>
  }

  return (
    <section id="kepadatan" aria-labelledby="kepadatan-heading" className="rounded-xl border border-zinc-200 bg-white p-6">
      <DensityPicker initialDensity={state.density} connected={state.accountId !== null} />
    </section>
  )
}
