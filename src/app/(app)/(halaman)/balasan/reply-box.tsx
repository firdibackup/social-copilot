'use client'

import { useTranslations } from 'next-intl'

import { Notice } from '@/components/notice'
import { REPLY_MAX_LENGTH } from '@/lib/inbox-rules'
import { draftDmReply, sendReply } from './actions'
import { Composer } from './composer'

interface ReplyBoxProps {
  igsid: string
  windowOpen: boolean
  brand: { name: string; logoUrl: string | null }
}

export function ReplyBox({ igsid, windowOpen, brand }: ReplyBoxProps) {
  const t = useTranslations('inbox.replyBox')
  if (!windowOpen) {
    return (
      <Notice tone="warning">
        {t('itSBeenOver24HoursSinceTheCustomer')}
        </Notice>
    )
  }

  return (
    <Composer
      placeholder={t('writeADm')}
      maxLength={REPLY_MAX_LENGTH}
      brand={brand}
      send={(text) => sendReply(igsid, text)}
      draft={(text) => draftDmReply(igsid, text)}
    />
  )
}
