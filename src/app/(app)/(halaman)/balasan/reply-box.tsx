'use client'

import { Notice } from '@/components/notice'
import { REPLY_MAX_LENGTH } from '@/lib/dm-templates'
import { draftDmReply, sendReply } from './actions'
import { Composer, type TemplateOption } from './composer'
import { openTemplates } from './templates-events'

/** The template whose keyword the customer's last message contains. */
export interface Suggestion {
  keyword: string
  text: string
}

interface ReplyBoxProps {
  igsid: string
  options: TemplateOption[]
  suggestion: Suggestion | null
  windowOpen: boolean
  brand: { name: string; logoUrl: string | null }
}

export function ReplyBox({ igsid, options, suggestion, windowOpen, brand }: ReplyBoxProps) {
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
      initialText={suggestion?.text ?? ''}
      send={(text) => sendReply(igsid, text)}
      draft={(text) => draftDmReply(igsid, text)}
      templates={options}
      onEditTemplates={openTemplates}
      suggestionNote={
        suggestion && <>Diisi dari template kata kunci “{suggestion.keyword}”. Periksa dulu, lalu kirim.</>
      }
    />
  )
}
