'use client'

import { intlLocale } from '@/i18n/locale-config'

import { useLocale, useTranslations } from 'next-intl'

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
  const locale = useLocale()

  const t = useTranslations('admin')

  const [state, action, saving] = useActionState(saveSettingsAction, INITIAL)
  const [textModel, setTextModel] = useState(values.textModel)
  const [imageModel, setImageModel] = useState(values.imageModel)
  const [credits, setCredits] = useState(String(values.planCredits))
  const perPost = Number(credits) > 0 ? Math.floor(Number(credits) / contentCost(3)) : null

  return (
    <form action={action} className="space-y-4">
      <section className={CARD}>
        <div className="space-y-1">
          <h2 className={CARD_TITLE}>{t('settings_form.aiModels')}</h2>
          <p className={HINT}>
            {t('settings_form.chooseFromTheListOrEnterA')}</p>
        </div>

        <ModelField
          name="textModel"
          label={t('settings_form.textModelCaptionsIdeasBrand')}
          kind="text"
          value={textModel}
          onChange={setTextModel}
          options={textModels}
          defaultModel={defaults.textModel}
          presets={textPresets}
        />
        <ModelField
          name="imageModel"
          label={t('settings_form.imageModelAiSlides')}
          kind="image"
          value={imageModel}
          onChange={setImageModel}
          options={imageModels}
          defaultModel={defaults.imageModel}
          presets={[]}
          note={t('settings_form.imageTestsTake3060SecondsAnd')}
        />
      </section>

      <section className={CARD}>
        <div className="space-y-1">
          <h2 className={CARD_TITLE}>{t('settings_form.manualAccessDefaults')}</h2>
          <p className={HINT}>
            {t('settings_form.usedWhenAnAdminGrantsAccessManually')}</p>
        </div>
        <label className={LABEL}>
          <span>{t('settings_form.planName')}</span>
          <input name="planName" defaultValue={values.planName} maxLength={PLAN_NAME_MAX_LENGTH} required className={FIELD} />
        </label>
        <div className="grid gap-3 sm:grid-cols-3">
          <label className={LABEL}>
            <span>{t('settings_form.priceRp')}</span>
            <input name="planPrice" type="number" min={0} step={1000} defaultValue={values.planPrice} required className={FIELD} />
          </label>
          <label className={LABEL}>
            <span>{t('settings_form.durationDays')}</span>
            <input name="planDays" type="number" min={1} max={MAX_GRANT_DAYS} defaultValue={values.planDays} required className={FIELD} />
          </label>
          <label className={LABEL}>
            <span>{t('settings_form.aiCreditsPerPeriod')}</span>
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
        {perPost !== null && <p className={HINT}>{t('settings_form.enoughForAbout')} {perPost} {t('settings_form.label3SlideCarouselPostsPerPeriod')}</p>}
      </section>

      {state.error && <Notice tone="error">{state.error}</Notice>}
      {state.success && <Notice tone="success">{state.success}</Notice>}
      <div className="flex flex-wrap items-center gap-3">
        <button type="submit" disabled={saving} className={PRIMARY_BUTTON}>
          {saving ? t('settings_form.saving') : t('settings_form.saveModelsManualAccess')}
        </button>
        {updatedAt && <span className="text-xs text-zinc-500">{t('settings_form.lastUpdated')} {formatDateTime(new Date(updatedAt), locale)}</span>}
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
  const locale = useLocale()
  const t = useTranslations('admin')

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
            placeholder={defaultModel ? t('settings_form.default', { v0: defaultModel }) : t('settings_form.enterModelId')}
            maxLength={MODEL_MAX_LENGTH}
            autoComplete="off"
            spellCheck={false}
            className={`${FIELD} min-w-0 flex-1 font-mono`}
          />
          <button type="button" onClick={test} disabled={testing || !tested} className={BUTTON}>
            {testing ? t('settings_form.testing') : t('settings_form.test')}
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
              {t('settings_form.useDefault')}</button>
          )}
        </div>
      )}
      <p className={HINT}>
        {options.length > 0 ? t('settings_form.modelsAvailableInTheList', { v0: options.length }) : ''}
        {note}
      </p>
      {result && (
        <div className="space-y-2">
          <Notice tone={result.ok ? 'success' : 'error'}>
            {result.ok ? t('settings_form.success') : t('settings_form.failed')} ({(result.ms / 1000).toLocaleString(intlLocale(locale), { minimumFractionDigits: 1, maximumFractionDigits: 1 })} {t('settings_form.sec')} {tested}): {result.message}
          </Notice>
          {result.ok && result.preview && (
            // eslint-disable-next-line @next/next/no-img-element -- a data URL from the test, not a page asset
            <img src={result.preview} alt={t('settings_form.imageModelTestResult')} className="size-32 rounded-lg border border-zinc-200" />
          )}
        </div>
      )}
    </div>
  )
}
