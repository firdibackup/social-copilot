'use client'

import { useTranslations } from 'next-intl'

import { useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Trash2 } from 'lucide-react'
import { confirmDialog } from '@/components/confirm-dialog'
import { deleteDraftAction } from './content-actions'
import { useEditorScope } from './editor-provider'
import { removePostOptimistically } from './optimistic-events'

export function DeleteDraftButton({ id, onError }: { id: string; onError: (message: string) => void }) {
  const t = useTranslations('editor.deleteDraftButton')

  const client = useQueryClient()
  const scope = useEditorScope()
  const lock = useRef(false)
  const [pending, setPending] = useState(false)

  async function remove() {
    if (lock.current) return
    lock.current = true
    const confirmed = await confirmDialog({
      title: t('message1'),
      description: t('message2'),
      confirmLabel: t('message3'),
      tone: 'danger',
    })
    if (!confirmed) {
      lock.current = false
      return
    }
    setPending(true)
    const restore = await removePostOptimistically(client, scope, id)
    const error = await deleteDraftAction(id).catch(() => t('message4'))
    if (error) {
      restore()
      lock.current = false
      setPending(false)
      onError(error)
    }
    // The action's refresh() already re-renders the list and editor; no second round trip.
  }

  return (
    <button type="button" disabled={pending} aria-busy={pending} onClick={() => void remove()}
      className="inline-flex min-h-9 items-center justify-center gap-1.5 rounded-lg border border-hairline bg-white px-3 py-2 text-sm font-medium text-red-700 transition-colors hover:bg-red-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-700 disabled:cursor-wait disabled:opacity-60">
      <Trash2 size={14} aria-hidden="true" />
      {pending ? t('message5') : t('message6')}
    </button>
  )
}
