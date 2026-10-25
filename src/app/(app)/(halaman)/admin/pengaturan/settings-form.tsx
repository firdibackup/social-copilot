'use client'

import { useActionState, useState, useTransition } from 'react'
import { Notice } from '@/components/notice'
import { MAX_GRANT_DAYS, MODEL_MAX_LENGTH, PLAN_NAME_MAX_LENGTH } from '@/lib/admin-options'
import { contentCost } from '@/lib/billing-options'
import { formatDateTime } from '@/lib/format'
import { saveSettingsAction, testModelAction, type FormState, type ModelTestResult } from '../actions'
import { BUTTON, CARD, CARD_TITLE, FIELD, HINT, LABEL, PRIMARY_BUTTON } from '../ui'

const INITIAL: FormState = { error: null, success: null }

interface SettingsFormProps {
  values: {
    textModel: string
    imageModel: string
    planName: string
    planPrice: number
    planDays: number
    planCredits: number
  }
  /** What applies when a model field is empty. */
  defaults: { textModel: string | null; imageModel: string }
  textModels: string[]
  /** One-click text models; the field still takes any id 9Router knows. */
  textPresets: string[]
  imageModels: string[]
  updatedAt: string | null
}

export function SettingsForm({ values, defaults, textModels, textPresets, imageModels, updatedAt }: SettingsFormProps) {
  const [state, action, saving] = useActionState(saveSettingsAction, INITIAL)
  const [textModel, setTextModel] = useState(values.textModel)
  const [imageModel, setImageModel] = useState(values.imageModel)
  const [credits, setCredits] = useState(String(values.planCredits))
  const perPost = Number(credits) > 0 ? Math.floor(Number(credits) / contentCost(3)) : null

  return (
    <form action={action} className="space-y-4">
      <section className={CARD}>
        <div className="space-y-1">
          <h2 className={CARD_TITLE}>Model AI</h2>
          <p className={HINT}>
            Pilih dari daftar atau ketik id model dari 9Router. Kosongkan untuk memakai default dari .env. Tes dulu sebelum
            menyimpan: model yang salah membuat semua fitur AI gagal.
          </p>
        </div>

        <ModelField
          name="textModel"
          label="Model teks (caption, ide, brand)"
          kind="text"
          value={textModel}
          onChange={setTextModel}
          options={textModels}
          defaultModel={defaults.textModel}
          presets={textPresets}
        />
        <ModelField
          name="imageModel"
          label="Model gambar (slide AI)"
          kind="image"
          value={imageModel}
          onChange={setImageModel}
          options={imageModels}
          defaultModel={defaults.imageModel}
          presets={[]}
          note="Tes gambar memakan waktu 30–60 detik dan memakai kuota 9Router."
        />
      </section>

      <section className={CARD}>
        <div className="space-y-1">
          <h2 className={CARD_TITLE}>Default pemberian akses manual</h2>
          <p className={HINT}>
            Dipakai saat admin memberikan akses manual. Paket Pro/Max diatur di bagian Paket & kredit di atas.
          </p>
        </div>
        <label className={LABEL}>
          <span>Nama paket</span>
          <input name="planName" defaultValue={values.planName} maxLength={PLAN_NAME_MAX_LENGTH} required className={FIELD} />
        </label>
        <div className="grid gap-3 sm:grid-cols-3">
          <label className={LABEL}>
            <span>Harga (Rp)</span>
            <input name="planPrice" type="number" min={0} step={1000} defaultValue={values.planPrice} required className={FIELD} />
          </label>
          <label className={LABEL}>
            <span>Durasi (hari)</span>
            <input name="planDays" type="number" min={1} max={MAX_GRANT_DAYS} defaultValue={values.planDays} required className={FIELD} />
          </label>
          <label className={LABEL}>
            <span>Kredit AI per periode</span>
            <input
              name="planCredits"
              type="number"
              min={1}
              value={credits}
              onChange={(event) => setCredits(event.target.value)}
              required
              className={FIELD}
            />
          </label>
        </div>
        {perPost !== null && <p className={HINT}>Cukup untuk sekitar {perPost} konten carousel 3 slide per periode.</p>}
      </section>

      {state.error && <Notice tone="error">{state.error}</Notice>}
      {state.success && <Notice tone="success">{state.success}</Notice>}
      <div className="flex flex-wrap items-center gap-3">
        <button type="submit" disabled={saving} className={PRIMARY_BUTTON}>
          {saving ? 'Menyimpan…' : 'Simpan model & akses manual'}
        </button>
        {updatedAt && <span className="text-xs text-zinc-500">Terakhir diubah {formatDateTime(new Date(updatedAt))}</span>}
      </div>
    </form>
  )
}

interface ModelFieldProps {
  name: string
  label: string
  kind: 'text' | 'image'
  value: string
  onChange: (value: string) => void
  options: string[]
  defaultModel: string | null
  presets: string[]
  note?: string
}

function ModelField({ name, label, kind, value, onChange, options, defaultModel, presets, note }: ModelFieldProps) {
  const [result, setResult] = useState<ModelTestResult | null>(null)
  const [testing, startTest] = useTransition()
  const listId = `${name}-options`
  const tested = value.trim() || defaultModel || ''

  const test = () =>
    startTest(async () => {
      setResult(null)
      setResult(await testModelAction(kind, tested))
    })

  return (
    <div className="space-y-2">
      <label className={LABEL}>
        <span>{label}</span>
        <div className="flex flex-wrap gap-2">
          <input
            name={name}
            list={listId}
            value={value}
            onChange={(event) => {
              onChange(event.target.value)
              setResult(null)
            }}
            placeholder={defaultModel ? `Default: ${defaultModel}` : 'Isi id model'}
            maxLength={MODEL_MAX_LENGTH}
            autoComplete="off"
            spellCheck={false}
            className={`${FIELD} min-w-0 flex-1 font-mono`}
          />
          <button type="button" onClick={test} disabled={testing || !tested} className={BUTTON}>
            {testing ? 'Menguji…' : 'Tes'}
          </button>
        </div>
      </label>
      <datalist id={listId}>
        {options.map((option) => (
          <option key={option} value={option} />
        ))}
      </datalist>
      {(presets.length > 0 || value) && (
        <div className="flex flex-wrap gap-1.5">
          {presets.map((preset) => (
            <button
              key={preset}
              type="button"
              onClick={() => {
                onChange(preset)
                setResult(null)
              }}
              className={`rounded-full border px-2.5 py-1 font-mono text-xs ${value === preset ? 'border-zinc-900 bg-zinc-900 text-white' : 'border-zinc-200 text-zinc-700 hover:bg-zinc-50'}`}
            >
              {preset}
            </button>
          ))}
          {value && (
            <button
              type="button"
              onClick={() => {
                onChange('')
                setResult(null)
              }}
              className="rounded-full border border-zinc-200 px-2.5 py-1 text-xs text-zinc-700 hover:bg-zinc-50"
            >
              Pakai default
            </button>
          )}
        </div>
      )}
      <p className={HINT}>
        {options.length > 0 ? `${options.length} model tersedia di daftar. ` : ''}
        {note}
      </p>
      {result && (
        <div className="space-y-2">
          <Notice tone={result.ok ? 'success' : 'error'}>
            {result.ok ? 'Berhasil' : 'Gagal'} ({(result.ms / 1000).toFixed(1)} dtk, {tested}): {result.message}
          </Notice>
          {result.ok && result.preview && (
            // eslint-disable-next-line @next/next/no-img-element -- a data URL from the test, not a page asset
            <img src={result.preview} alt="Hasil tes model gambar" className="size-32 rounded-lg border border-zinc-200" />
          )}
        </div>
      )}
    </div>
  )
}
