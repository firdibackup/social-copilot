'use server'

import { getTranslations } from 'next-intl/server'
import { refresh } from 'next/cache'
import { requireAccount } from '@/lib/auth'
import { describeError } from '@/lib/errors'
import { saveSlots } from '@/lib/schedule'
import { MAX_SLOT_TIMES, parseSlots, type PostingSlot } from '@/lib/schedule-slots'

export type SlotsResult = { slots: PostingSlot[] } | { error: string }

/** The slot table on Pengaturan and in Kalender: saved on every change. Posts keep their times. */
export async function saveSlotsAction(input: unknown): Promise<SlotsResult> {
  const t = await getTranslations('common')
  const { userId, accountId } = await requireAccount()
  const parsed = parseSlots(input)
  if ('error' in parsed) {
    if (Array.isArray(input) && input.length > MAX_SLOT_TIMES) return { error: t('slots.maxTimes', { max: MAX_SLOT_TIMES }) }
    const duplicate = /^Jam (.+) muncul dua kali\.$/.exec(parsed.error)
    return { error: duplicate ? t('slots.duplicate', { time: duplicate[1] }) : t('slots.invalid') }
  }
  try {
    await saveSlots(userId, accountId, parsed.slots)
  } catch (error) {
    console.error('[jadwal] slot gagal disimpan:', describeError(error))
    return { error: t('slots.saveError') }
  }
  refresh()
  return parsed
}
