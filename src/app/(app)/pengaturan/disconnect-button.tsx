'use client'

import type { FormEvent } from 'react'
import { disconnectInstagram } from './actions'

const CONFIRM_MESSAGE =
  'Putuskan akun Instagram? Posting terjadwal dan DM tidak akan berjalan sampai akun dihubungkan lagi.'

function confirmDisconnect(event: FormEvent<HTMLFormElement>) {
  if (!window.confirm(CONFIRM_MESSAGE)) event.preventDefault()
}

export function DisconnectButton() {
  return (
    <form action={disconnectInstagram} onSubmit={confirmDisconnect}>
      <button
        type="submit"
        className="rounded-lg border border-zinc-200 px-4 py-2 text-sm font-medium text-red-600 hover:bg-red-50"
      >
        Putuskan
      </button>
    </form>
  )
}
