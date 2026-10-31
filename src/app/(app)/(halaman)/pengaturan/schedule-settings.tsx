
import { getTranslations } from 'next-intl/server'
import { Notice } from '@/components/notice'
import { SlotEditor } from '@/components/slot-editor'
import { requireUser } from '@/lib/auth'
import { getConnectedAccountId } from '@/lib/connection'
import { ConfigError, describeError } from '@/lib/errors'
import { getScheduleSettings, type ScheduleSettings as Settings } from '@/lib/schedule'

const CARD = 'space-y-3 rounded-xl border border-zinc-200 bg-white p-6'

/** Jadwal: the time zone every schedule uses, and the account's posting slots with the posts-per-week preset. */
export async function ScheduleSettings() {
  const t = await getTranslations('settings')

  const userId = await requireUser()
  let settings: Settings | null
  try {
    const accountId = await getConnectedAccountId(userId)
    settings = accountId ? await getScheduleSettings(userId, accountId) : null
  } catch (error) {
    console.error('[pengaturan] jadwal gagal dimuat:', describeError(error))
    return <Notice tone="warning">{error instanceof ConfigError ? t('loadErrors.configuration', { message: error.message }) : t('loadErrors.database')}</Notice>
  }

  return (
    <section id="jadwal" aria-labelledby="jadwal-heading" className="space-y-4">
      <h2 id="jadwal-heading" className="pt-2 text-lg font-semibold tracking-tight text-zinc-900">
        {t('schedule_settings.schedule')}</h2>
      <div className={CARD}>
        <h3 className="font-medium text-zinc-900">{t('schedule_settings.timeZone')}</h3>
        <p className="text-sm text-zinc-600">
          <span className="font-medium text-zinc-900">WIB</span>  {t('schedule_settings.asiaJakartaGmt0700SchedulesPosting')}</p>
      </div>
      <div className={CARD}>
        <h3 className="font-medium text-zinc-900">{t('schedule_settings.postingSlots')}</h3>
        {settings ? (
          <SlotEditor initialSlots={settings.slots} isDefault={!settings.isCustom} withPreset />
        ) : (
          <p className="text-sm text-zinc-600">{t('schedule_settings.connectInstagramFirstPostingSlotsAreSaved')}</p>
        )}
      </div>
    </section>
  )
}
