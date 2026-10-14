'use client'

import { Trash2 } from 'lucide-react'
import { useActionState, type FormEvent } from 'react'
import { deleteAssetAction } from './actions'

function confirmDelete(event: FormEvent<HTMLFormElement>) {
  if (!window.confirm('Hapus foto ini dari Aset?')) event.preventDefault()
}

export function DeleteAssetButton({ id }: { id: string }) {
  const [error, formAction, pending] = useActionState(deleteAssetAction, null)

  return (
    <form action={formAction} onSubmit={confirmDelete}>
      <input type="hidden" name="id" value={id} />
      <button
        type="submit"
        disabled={pending}
        aria-label="Hapus foto"
        className="absolute top-2 right-2 rounded-md bg-white/90 p-1.5 text-zinc-600 shadow-sm hover:text-red-600 disabled:opacity-60"
      >
        <Trash2 size={16} aria-hidden="true" />
      </button>
      {error && (
        <p role="alert" className="absolute inset-x-0 bottom-0 bg-red-600/90 px-2 py-1 text-xs text-white">
          {error}
        </p>
      )}
    </form>
  )
}
