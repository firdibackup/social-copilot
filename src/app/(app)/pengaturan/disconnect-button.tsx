'use client'

import type { FormEvent } from 'react'
import { disconnectFacebook, disconnectInstagram } from './actions'

const SERVICES = {
  instagram: {
    action: disconnectInstagram,
    confirm: 'Putuskan akun Instagram? Posting terjadwal dan DM tidak akan berjalan sampai akun dihubungkan lagi.',
  },
  facebook: {
    action: disconnectFacebook,
    confirm: 'Putuskan Facebook? Referensi dari akun lain tidak bisa dicari sampai Facebook dihubungkan lagi.',
  },
}

export function DisconnectButton({ service = 'instagram' }: { service?: keyof typeof SERVICES }) {
  const { action, confirm } = SERVICES[service]

  function confirmDisconnect(event: FormEvent<HTMLFormElement>) {
    if (!window.confirm(confirm)) event.preventDefault()
  }

  return (
    <form action={action} onSubmit={confirmDisconnect}>
      <button
        type="submit"
        className="rounded-lg border border-zinc-200 px-4 py-2 text-sm font-medium text-red-600 hover:bg-red-50"
      >
        Putuskan
      </button>
    </form>
  )
}
