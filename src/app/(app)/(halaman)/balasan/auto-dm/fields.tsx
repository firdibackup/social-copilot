'use client'

import { useTranslations } from 'next-intl'

import { Check, Plus, X } from 'lucide-react'
import { useState, type KeyboardEvent, type ReactNode } from 'react'
import { LoadingState } from '@/components/loading-state'
import { ExternalImage } from '@/components/media-image'
import type { RulePost } from '../auto-dm-actions'

/** Placeholders, shown in the form and, without "cth. ", in an empty preview bubble. */
export function usePlaceholders() {
  const t = useTranslations('inbox.placeholders')
  return {
    name: t('name'),
    keyword: t('keyword'),
    variation: t('variation'),
    openerText: t('openerText'),
    openerButton: t('openerButton'),
    followText: t('followText'),
    followButton: t('followButton'),
    mainText: t('mainText'),
    linkText: t('linkText'),
    linkUrl: t('linkUrl'),
  }
}

export const withoutExample = (placeholder: string) => placeholder.replace(/^(?:cth\.|e\.g\.) /, '')

export const FIELD =
  'block w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 placeholder:text-zinc-400 focus:border-zinc-400 focus:outline-none'
const HELPER = 'text-xs text-zinc-500'

export function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-3">
      <h2 className="text-[15px] font-semibold text-zinc-900">{title}</h2>
      {children}
    </section>
  )
}

interface SegmentedProps<T extends string> {
  label: string
  options: readonly { value: T; label: string }[]
  value: T
  onChange: (value: T) => void
}

/** Pills where the chosen one is filled, like a radio group. */
export function Segmented<T extends string>({ label, options, value, onChange }: SegmentedProps<T>) {
  return (
    <div role="radiogroup" aria-label={label} className="inline-flex gap-1 rounded-full border border-zinc-200 bg-white p-1">
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          role="radio"
          aria-checked={value === option.value}
          onClick={() => onChange(option.value)}
          className={`rounded-full px-3.5 py-1.5 text-sm font-medium transition-colors ${
            value === option.value ? 'bg-zinc-900 text-white' : 'text-zinc-600 hover:text-zinc-900'
          }`}
        >
          {option.label}
        </button>
      ))}
    </div>
  )
}

interface RadioCardProps {
  name: string
  checked: boolean
  onSelect: () => void
  label: string
  /** Shown only while chosen. */
  children: ReactNode
}

export function RadioCard({ name, checked, onSelect, label, children }: RadioCardProps) {
  return (
    <div
      className={`rounded-lg border p-3 transition-colors ${checked ? 'border-zinc-300 bg-zinc-50' : 'border-zinc-200 bg-white'}`}
    >
      <label className="flex cursor-pointer items-center gap-2 text-sm font-medium text-zinc-900">
        <input type="radio" name={name} checked={checked} onChange={onSelect} className="size-4" />
        {label}
      </label>
      {checked && <div className="mt-3 space-y-2 pl-6">{children}</div>}
    </div>
  )
}

interface ToggleProps {
  checked: boolean
  onChange: (checked: boolean) => void
  label: string
  helper?: ReactNode
  /** The fields this option opens, indented under it. */
  children?: ReactNode
}

export function Toggle({ checked, onChange, label, helper, children }: ToggleProps) {
  return (
    <div className="space-y-3">
      <label className="flex cursor-pointer items-start gap-2">
        <input
          type="checkbox"
          checked={checked}
          onChange={(event) => onChange(event.target.checked)}
          className="mt-0.5 size-4 shrink-0"
        />
        <span className="space-y-0.5">
          <span className="block text-sm font-medium text-zinc-900">{label}</span>
          {helper && <span className="block">{helper}</span>}
        </span>
      </label>
      {checked && children && <div className="ml-2 space-y-3 border-l border-zinc-200 pl-4">{children}</div>}
    </div>
  )
}

export const Helper = ({ children, warning = false }: { children: ReactNode; warning?: boolean }) => (
  <span className={warning ? 'text-xs font-medium text-amber-700' : HELPER}>{children}</span>
)

interface CountedInputProps {
  label: string
  value: string
  onChange: (value: string) => void
  placeholder: string
  max: number
}

/** A short text field with a live n/max counter, e.g. a button's text. */
export function CountedInput({ label, value, onChange, placeholder, max }: CountedInputProps) {
  return (
    <label className="block space-y-1">
      <span className="flex items-center justify-between text-sm font-medium text-zinc-900">
        {label}
        <span className="text-xs font-normal text-zinc-500 tabular-nums">
          {value.length}/{max}
        </span>
      </span>
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        maxLength={max}
        placeholder={placeholder}
        className={FIELD}
      />
    </label>
  )
}

interface TextAreaProps {
  label: string
  value: string
  onChange: (value: string) => void
  placeholder: string
  max: number
  rows: number
}

export function TextArea({ label, value, onChange, placeholder, max, rows }: TextAreaProps) {
  return (
    <label className="block space-y-1">
      <span className="text-sm font-medium text-zinc-900">{label}</span>
      <textarea
        value={value}
        onChange={(event) => onChange(event.target.value)}
        maxLength={max}
        rows={rows}
        placeholder={placeholder}
        className={FIELD}
      />
    </label>
  )
}

interface TagInputProps {
  values: string[]
  onChange: (values: string[]) => void
  placeholder: string
  maxLength: number
  maxCount: number
  examples: readonly string[]
}

/** Keywords as chips: Enter adds one, × removes it. The examples show until the first keyword. */
export function TagInput({ values, onChange, placeholder, maxLength, maxCount, examples }: TagInputProps) {
  const t = useTranslations('inbox.builderFields')
  const [draft, setDraft] = useState('')

  function add(value: string) {
    const keyword = value.trim()
    const isKnown = values.some((existing) => existing.toLowerCase() === keyword.toLowerCase())
    if (keyword && !isKnown && values.length < maxCount) onChange([...values, keyword])
  }

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'Enter') {
      event.preventDefault()
      add(draft)
      setDraft('')
    } else if (event.key === 'Backspace' && draft === '' && values.length > 0) {
      onChange(values.slice(0, -1))
    }
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-1.5 rounded-lg border border-zinc-200 bg-white px-2 py-1.5 focus-within:border-zinc-400">
        {values.map((keyword) => (
          <span key={keyword} className="inline-flex items-center gap-1 rounded-md bg-zinc-100 px-2 py-0.5 text-sm font-medium text-zinc-900">
            {keyword}
            <button
              type="button"
              aria-label={t('removeKeyword', { keyword })}
              onClick={() => onChange(values.filter((value) => value !== keyword))}
              className="text-zinc-500 hover:text-zinc-900"
            >
              <X size={14} aria-hidden="true" />
            </button>
          </span>
        ))}
        <input
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={onKeyDown}
          onBlur={() => {
            add(draft)
            setDraft('')
          }}
          maxLength={maxLength}
          placeholder={values.length === 0 ? placeholder : ''}
          aria-label={t('keywords')}
          className="min-w-32 flex-1 bg-transparent px-1 py-0.5 text-sm text-zinc-900 placeholder:text-zinc-400 focus:outline-none"
        />
      </div>
      <p className={HELPER}>{t('oneMatchingKeywordIsEnoughCapitalizationDoesnTMatter')}</p>
      {values.length === 0 && (
        <p className="flex flex-wrap items-center gap-1.5 text-xs text-zinc-500">
           {t('examples')} {examples.map((example) => (
            <button
              key={example}
              type="button"
              onClick={() => add(example)}
              className="rounded-full border border-zinc-200 bg-white px-2.5 py-0.5 font-medium text-zinc-800 hover:bg-zinc-50"
            >
              {example}
            </button>
          ))}
        </p>
      )}
    </div>
  )
}

interface VariationsProps {
  values: string[]
  onChange: (values: string[]) => void
  maxLength: number
  maxCount: number
}

/** Public reply variations; one is picked at random per reply. */
export function Variations({ values, onChange, maxLength, maxCount }: VariationsProps) {
  const t = useTranslations('inbox.builderFields')
  const placeholders = usePlaceholders()
  const replace = (index: number, value: string) => onChange(values.map((item, at) => (at === index ? value : item)))
  return (
    <div className="space-y-2">
      {values.map((value, index) => (
        <div key={index} className="flex items-center gap-2">
          <input
            value={value}
            onChange={(event) => replace(index, event.target.value)}
            maxLength={maxLength}
            placeholder={placeholders.variation}
            aria-label={t('variation', { number: index + 1 })}
            className={FIELD}
          />
          {values.length > 1 && (
            <button
              type="button"
              aria-label={t('removeVariation', { number: index + 1 })}
              onClick={() => onChange(values.filter((_, at) => at !== index))}
              className="text-zinc-400 hover:text-zinc-900"
            >
              <X size={16} aria-hidden="true" />
            </button>
          )}
        </div>
      ))}
      {values.length < maxCount && (
        <button
          type="button"
          onClick={() => onChange([...values, ''])}
          className="inline-flex items-center gap-1 text-sm font-medium text-zinc-700 hover:text-zinc-900"
        >
          <Plus size={14} aria-hidden="true" />
          {t('addVariation')}
          </button>
      )}
      <p className={HELPER}>{t('withMultipleVariationsEachReplyIsPickedAtRandom')}</p>
    </div>
  )
}

interface PostPickerProps {
  posts: RulePost[] | null
  error: string | null
  selectedId: string | null
  onSelect: (id: string) => void
}

/** The account's newest posts, three a row; one can be chosen. */
export function PostPicker({ posts, error, selectedId, onSelect }: PostPickerProps) {
  const t = useTranslations('inbox.builderFields')
  if (error) return <p className="text-sm text-red-700">{error}</p>
  if (!posts) return <LoadingState variant="gallery" label={t('loadingPosts')} />
  if (posts.length === 0) return <p className="text-sm text-zinc-500">{t('noPostsOnThisAccountYet')}</p>
  const isListed = selectedId === null || posts.some((post) => post.id === selectedId)
  return (
    <div className="space-y-2">
      {!isListed && <p className="text-xs text-zinc-500">{t('thePreviouslySelectedPostIsnTAmongThe24')}</p>}
      <div className="grid max-w-[18rem] grid-cols-3 gap-1.5">
        {posts.map((post) => {
          const selected = post.id === selectedId
          return (
            <button
              key={post.id}
              type="button"
              aria-pressed={selected}
              aria-label={post.caption ? t('postCaption', { caption: post.caption.slice(0, 60) }) : t('postWithoutACaption')}
              onClick={() => onSelect(post.id)}
              className={`relative aspect-square overflow-hidden rounded-md bg-zinc-100 ${
                selected ? 'ring-2 ring-zinc-900 ring-offset-1' : 'hover:opacity-90'
              }`}
            >
              {post.thumbnailUrl && <ExternalImage src={post.thumbnailUrl} className="size-full object-cover" />}
              {selected && (
                <span className="absolute top-1 right-1 flex size-5 items-center justify-center rounded-full bg-zinc-900 text-white">
                  <Check size={12} aria-hidden="true" />
                </span>
              )}
            </button>
          )
        })}
      </div>
    </div>
  )
}
