'use client'

import { Send } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { Notice } from '@/components/notice'
import { REPLY_MAX_LENGTH } from '@/lib/dm-templates'
import { sendReply } from './actions'

/** A template already filled in for this conversation. */
export interface TemplateOption {
  id: string
  label: string
  text: string
}

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
}

const FIELD =
  'block w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 focus:border-zinc-400 focus:outline-none disabled:bg-zinc-50'

/**
 * The draft is controlled state sent through the action directly, not a form action: React resets uncontrolled
 * fields after a form action, which would wipe an edited reply when Instagram refuses it.
 */
export function ReplyBox({ igsid, options, suggestion, windowOpen }: ReplyBoxProps) {
  const [text, setText] = useState(suggestion?.text ?? '')
  const [fromSuggestion, setFromSuggestion] = useState(suggestion !== null)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setPending(true)
    setError(null)
    const failure = await sendReply(igsid, text).catch(() => 'Balasan gagal dikirim. Coba lagi.')
    setPending(false)
    if (failure) {
      setError(failure)
    } else {
      setText('')
      setFromSuggestion(false)
    }
  }

  if (!windowOpen) {
    return (
      <Notice tone="warning">
        Sudah lewat 24 jam sejak pesan terakhir pelanggan, jadi Instagram tidak menerima balasan dari aplikasi. Balas
        lewat aplikasi Instagram, atau tunggu pelanggan mengirim pesan lagi.
      </Notice>
    )
  }

  return (
    <form onSubmit={submit} className="space-y-3">
      {options.length > 0 && (
        <label className="block space-y-1 text-sm font-medium text-zinc-900">
          <span>Pakai template</span>
          <select
            value=""
            onChange={(event) => {
              const option = options.find((item) => item.id === event.target.value)
              if (option) {
                setText(option.text)
                setFromSuggestion(false)
              }
            }}
            className={FIELD}
          >
            <option value="">Pilih template…</option>
            {options.map((option) => (
              <option key={option.id} value={option.id}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
      )}

      <label className="block space-y-1 text-sm font-medium text-zinc-900">
        <span>Balasan</span>
        <textarea
          value={text}
          onChange={(event) => setText(event.target.value)}
          rows={4}
          maxLength={REPLY_MAX_LENGTH}
          required
          className={FIELD}
        />
      </label>
      {fromSuggestion && suggestion && (
        <p className="text-xs text-zinc-500">
          Diisi dari aturan kata kunci “{suggestion.keyword}”. Periksa dulu, lalu kirim.
        </p>
      )}

      {error && <Notice tone="error">{error}</Notice>}

      <button
        type="submit"
        disabled={pending || text.trim() === ''}
        className="inline-flex items-center gap-1.5 rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-50"
      >
        <Send size={16} aria-hidden="true" />
        {pending ? 'Mengirim…' : 'Kirim'}
      </button>
    </form>
  )
}
