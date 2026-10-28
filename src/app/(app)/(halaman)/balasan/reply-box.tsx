'use client'

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
  if (!windowOpen) {
    return (
      <Notice tone="warning">
        Sudah lewat 24 jam sejak pesan terakhir pelanggan, jadi Instagram tidak menerima balasan dari aplikasi. Balas
        lewat aplikasi Instagram, atau tunggu pelanggan mengirim pesan lagi.
      </Notice>
    )
  }

  return (
    <Composer
      placeholder="Tulis DM…"
      maxLength={REPLY_MAX_LENGTH}
      brand={brand}
      send={(text) => sendReply(igsid, text)}
      draft={(text) => draftDmReply(igsid, text)}
    />
  )
}
