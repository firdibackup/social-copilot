'use client'

import { useState, useTransition } from 'react'
import { Notice } from '@/components/notice'
import { DENSITY_ORDER, TEXT_DENSITIES, type TextDensity } from '@/lib/density-options'
import { setDensityDefaultAction } from './actions'

const FAILED = 'Gagal menghubungi server. Coba lagi.'

/** Saves on its own as soon as an option is picked; goes back to the old one when saving fails. */
export function DensityPicker({ initialDensity, connected }: { initialDensity: TextDensity; connected: boolean }) {
  const [density, setDensity] = useState(initialDensity)
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  function pick(next: TextDensity) {
    if (next === density) return
    const before = density
    setDensity(next)
    setError(null)
    startTransition(async () => {
      const failure = await setDensityDefaultAction(next).catch(() => FAILED)
      if (failure) {
        setDensity(before)
        setError(failure)
      }
    })
  }

  return (
    <fieldset className="space-y-3" disabled={!connected || pending} aria-describedby="kepadatan-hint">
      <div className="space-y-1">
        <legend id="kepadatan-heading" className="text-xs font-semibold tracking-wider text-zinc-900 uppercase">
          Kepadatan teks slide
        </legend>
        <p id="kepadatan-hint" className="text-sm text-zinc-500">
          {connected
            ? 'Default untuk post baru di Buat: seberapa banyak teks di tiap slide. Masih bisa diganti per post.'
            : 'Hubungkan Instagram dulu.'}
        </p>
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        {DENSITY_ORDER.map((key) => {
          const option = TEXT_DENSITIES[key]
          const checked = density === key
          return (
            <label
              key={key}
              className={`flex cursor-pointer flex-col gap-1 rounded-lg border p-3 text-sm transition-colors has-[:disabled]:cursor-not-allowed has-[:disabled]:opacity-60 has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-accent ${checked ? 'border-accent bg-accent-soft' : 'border-zinc-200 hover:bg-zinc-50'}`}
            >
              <span className="flex items-center gap-2 font-medium text-zinc-900">
                <input
                  type="radio"
                  name="kepadatan"
                  value={key}
                  checked={checked}
                  onChange={() => pick(key)}
                  className="accent-accent"
                />
                {option.label}
              </span>
              <span className="text-zinc-500">{option.description}</span>
            </label>
          )
        })}
      </div>
      {error && <Notice tone="error">{error}</Notice>}
    </fieldset>
  )
}
