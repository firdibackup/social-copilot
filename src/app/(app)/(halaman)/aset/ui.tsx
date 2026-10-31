'use client'

import { useState, useTransition } from 'react'
import { confirmDialog } from '@/components/confirm-dialog'
import type { AssetActionState } from './actions'

export const INITIAL_STATE: AssetActionState = { error: null, success: null }

export const PRIMARY_BUTTON =
  'inline-flex min-h-10 items-center justify-center gap-2 rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-white hover:bg-accent-deep disabled:opacity-60'
export const SECONDARY_BUTTON =
  'inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border border-hairline bg-paper px-3 py-2 text-sm font-medium text-ink hover:bg-zinc-50 disabled:opacity-60'
export const DANGER_BUTTON =
  'inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border border-red-200 bg-paper px-3 py-2 text-sm font-medium text-red-700 hover:bg-red-50 disabled:opacity-60'
export const FIELD = 'block min-h-10 w-full rounded-lg border border-hairline bg-paper px-3 text-sm font-normal text-ink'

export function Feedback({ state }: { state: AssetActionState }) {
  if (!state.error && !state.success) return null
  return (
    <p role={state.error ? 'alert' : 'status'} className={`text-xs ${state.error ? 'text-red-700' : 'text-emerald-700'}`}>
      {state.error ?? state.success}
    </p>
  )
}

export function confirmDelete(count: number): Promise<boolean> {
  return confirmDialog({
    title: count === 1 ? 'Hapus foto ini?' : `Hapus ${count} foto?`,
    description: 'Foto akan dihapus dari Aset.',
    confirmLabel: 'Hapus',
    tone: 'danger',
  })
}

type AssetAction = (previous: AssetActionState, formData: FormData) => Promise<AssetActionState>
type Fields = Record<string, string | string[]>

function toFormData(fields: Fields): FormData {
  const data = new FormData()
  for (const [name, value] of Object.entries(fields)) {
    for (const item of [value].flat()) data.append(name, item)
  }
  return data
}

/** Runs one of the Aset actions outside a form, keeping the last answer for <Feedback>. */
export function useAssetAction() {
  const [pending, startTransition] = useTransition()
  const [state, setState] = useState<AssetActionState>(INITIAL_STATE)

  function run(action: AssetAction, fields: Fields | FormData, onDone?: (result: AssetActionState) => void) {
    startTransition(async () => {
      let result: AssetActionState
      try {
        result = await action(INITIAL_STATE, fields instanceof FormData ? fields : toFormData(fields))
      } catch {
        result = { error: 'Koneksi terputus. Coba lagi.', success: null }
      }
      setState(result)
      onDone?.(result)
    })
  }

  return { pending, state, run, clear: () => setState(INITIAL_STATE) }
}
