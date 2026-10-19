'use client'

import { ChevronRight, Plus } from 'lucide-react'
import { useEffect, useRef, useState, type FormEvent } from 'react'
import { Notice } from '@/components/notice'
import { BUILT_IN_VARIABLES, KEYWORD_MAX_LENGTH, REPLY_MAX_LENGTH, type DmTemplate } from '@/lib/dm-templates'
import { deleteTemplateAction, saveTemplateAction, saveVariablesAction } from './actions'
import { onOpenRules, openRules } from './rules-events'

interface TemplatesPanelProps {
  templates: DmTemplate[]
  variablesText: string
}

const LABEL = 'block space-y-1 text-sm font-medium text-zinc-900'
const FIELD =
  'block w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm font-normal text-zinc-900 focus:border-zinc-400 focus:outline-none'
const PRIMARY_BUTTON =
  'rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-50'
const BUTTON =
  'inline-flex items-center gap-1.5 rounded-lg border border-zinc-200 bg-white px-3 py-1.5 text-sm font-medium text-zinc-800 hover:bg-zinc-50 disabled:opacity-50'

const FAILED = 'Gagal menghubungi server. Coba lagi.'

/** + Auto DM in the page header: opens the form for a new rule. */
export function NewRuleButton() {
  return (
    <button
      type="button"
      onClick={() => openRules(true)}
      className="inline-flex items-center gap-1.5 rounded-lg bg-zinc-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-zinc-800"
    >
      <Plus size={16} aria-hidden="true" />
      Auto DM
    </button>
  )
}

/** The "Aturan Auto DM" section: reply templates, their keywords, and the owner's variables. */
export function TemplatesPanel({ templates, variablesText }: TemplatesPanelProps) {
  const [open, setOpen] = useState(false)
  // 'new', the template being edited, or null when the form is closed.
  const [editing, setEditing] = useState<DmTemplate | 'new' | null>(null)
  const section = useRef<HTMLElement>(null)

  useEffect(
    () =>
      onOpenRules(({ newRule }) => {
        setOpen(true)
        if (newRule) setEditing('new')
        requestAnimationFrame(() => section.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }))
      }),
    [],
  )

  return (
    <section ref={section} id="aturan" aria-labelledby="aturan-auto-dm" className="scroll-mt-4 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <button
          type="button"
          id="aturan-auto-dm"
          aria-expanded={open}
          onClick={() => setOpen(!open)}
          className="inline-flex items-center gap-1.5 font-medium text-zinc-900"
        >
          <ChevronRight size={18} aria-hidden="true" className={open ? 'rotate-90' : undefined} />
          Aturan Auto DM ({templates.length})
        </button>
      </div>

      {open && (
        <div className="space-y-4">
          <p className="max-w-2xl text-sm text-zinc-500">
            Template dengan kata kunci mengisi draf balasan saat pesan pelanggan memuat kata itu sebagai kata utuh,
            dengan huruf besar-kecil yang sama: “promo” cocok dengan “ada promo?”, tapi tidak dengan “Promo” atau
            “promosi”. Template tanpa kata kunci dipilih manual. Balasan tetap dikirim lewat tombol Kirim.
          </p>

          {editing && (
            <TemplateForm
              key={editing === 'new' ? 'new' : editing.id}
              template={editing === 'new' ? null : editing}
              onDone={() => setEditing(null)}
            />
          )}

          {templates.length === 0 ? (
            <p className="rounded-xl border border-dashed border-zinc-300 p-6 text-center text-sm text-zinc-500">
              Belum ada aturan. Klik + Auto DM untuk membuat yang pertama.
            </p>
          ) : (
            <ul className="divide-y divide-zinc-100 overflow-hidden rounded-xl border border-zinc-200 bg-white">
              {templates.map((template) => (
                <TemplateRow key={template.id} template={template} onEdit={() => setEditing(template)} />
              ))}
            </ul>
          )}

          <VariablesForm initialText={variablesText} />
        </div>
      )}
    </section>
  )
}

function TemplateRow({ template, onEdit }: { template: DmTemplate; onEdit: () => void }) {
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function remove() {
    if (!window.confirm('Hapus aturan ini?')) return
    setPending(true)
    setError(await deleteTemplateAction(template.id).catch(() => FAILED))
    setPending(false)
  }

  return (
    <li className="space-y-2 px-4 py-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1 space-y-1">
          <p className="text-xs font-semibold tracking-wide text-zinc-500 uppercase">
            {template.keyword ? `Kata kunci: ${template.keyword}` : 'Manual'}
          </p>
          <p className="line-clamp-3 text-sm whitespace-pre-line text-zinc-900">{template.body}</p>
        </div>
        <div className="flex gap-2">
          <button type="button" onClick={onEdit} className={BUTTON}>
            Ubah
          </button>
          <button type="button" onClick={remove} disabled={pending} className={`${BUTTON} hover:text-red-600`}>
            Hapus
          </button>
        </div>
      </div>
      {error && <Notice tone="error">{error}</Notice>}
    </li>
  )
}

function TemplateForm({ template, onDone }: { template: DmTemplate | null; onDone: () => void }) {
  const [keyword, setKeyword] = useState(template?.keyword ?? '')
  const [body, setBody] = useState(template?.body ?? '')
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setPending(true)
    const failure = await saveTemplateAction(template?.id ?? null, keyword, body).catch(() => FAILED)
    setPending(false)
    if (failure) setError(failure)
    else onDone()
  }

  return (
    <form onSubmit={submit} className="space-y-3 rounded-xl border border-zinc-200 bg-white p-4">
      <h2 className="font-medium text-zinc-900">{template ? 'Ubah aturan' : 'Aturan baru'}</h2>
      <label className={LABEL}>
        <span>Kata kunci (opsional)</span>
        <input
          value={keyword}
          onChange={(event) => setKeyword(event.target.value)}
          maxLength={KEYWORD_MAX_LENGTH}
          placeholder="mis. promo"
          className={FIELD}
        />
      </label>
      <label className={LABEL}>
        <span>Template balasan</span>
        <textarea
          value={body}
          onChange={(event) => setBody(event.target.value)}
          rows={4}
          maxLength={REPLY_MAX_LENGTH}
          required
          placeholder="Halo {sender_name}! Promo minggu ini dari {brand_name}: …"
          className={FIELD}
        />
      </label>
      <p className="text-xs text-zinc-500">
        Variabel otomatis:{' '}
        {Object.entries(BUILT_IN_VARIABLES).map(([name, description], index) => (
          <span key={name}>
            {index > 0 && '; '}
            <code>{`{${name}}`}</code> {description}
          </span>
        ))}
        . Variabel buatanmu diatur di bawah daftar aturan.
      </p>
      {error && <Notice tone="error">{error}</Notice>}
      <div className="flex gap-2">
        <button type="submit" disabled={pending} className={PRIMARY_BUTTON}>
          {pending ? 'Menyimpan…' : 'Simpan'}
        </button>
        <button type="button" onClick={onDone} className={BUTTON}>
          Batal
        </button>
      </div>
    </form>
  )
}

function VariablesForm({ initialText }: { initialText: string }) {
  const [text, setText] = useState(initialText)
  const [pending, setPending] = useState(false)
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null)

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setPending(true)
    const failure = await saveVariablesAction(text).catch(() => FAILED)
    setPending(false)
    setResult(failure ? { ok: false, message: failure } : { ok: true, message: 'Variabel tersimpan.' })
  }

  return (
    <form onSubmit={submit} className="space-y-3 rounded-xl border border-zinc-200 bg-white p-4">
      <label className={LABEL}>
        <span>Variabel buatanmu</span>
        <span className="block text-xs font-normal text-zinc-500">
          Satu per baris, lalu pakai di template sebagai {'{nama}'}, mis. {'{brand_name}'}.
        </span>
        <textarea
          value={text}
          onChange={(event) => setText(event.target.value)}
          rows={4}
          placeholder={'brand_name = Toko Sinar\njam_buka = 09.00–17.00 WIB'}
          className={`${FIELD} font-mono`}
        />
      </label>
      {result && <Notice tone={result.ok ? 'success' : 'error'}>{result.message}</Notice>}
      <button type="submit" disabled={pending} className={PRIMARY_BUTTON}>
        {pending ? 'Menyimpan…' : 'Simpan variabel'}
      </button>
    </form>
  )
}
