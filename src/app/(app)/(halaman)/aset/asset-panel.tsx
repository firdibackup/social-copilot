'use client'

import { useTranslations } from 'next-intl'

import { Pause, Play, Sparkles, Trash2, X } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { MediaImage } from '@/components/media-image'
import { MAX_ASSET_TAGS, TAG_MAX_LENGTH } from '@/lib/asset-options'
import type { Asset, AssetGroup } from '@/lib/assets'
import { tagCost } from '@/lib/billing-options'
import {
  deleteAssetsAction,
  moveAssetsAction,
  setAssetActiveAction,
  tagAssetsAction,
  updateAssetTagsAction,
} from './actions'
import { confirmDelete, DANGER_BUTTON, Feedback, FIELD, PRIMARY_BUTTON, SECONDARY_BUTTON, useAssetAction } from './ui'

interface AssetPanelProps {
  asset: Asset
  groups: AssetGroup[]
  onClose: () => void
}

/** One photo up close: its product, status and tags. AI results can only be deleted. */
export function AssetPanel({ asset, groups, onClose }: AssetPanelProps) {
  const t = useTranslations('assets')
  const own = asset.origin !== 'ai'
  const action = useAssetAction()
  const [tags, setTags] = useState(asset.tags.join(', '))
  const [groupId, setGroupId] = useState(asset.groupId ?? '')

  // A refresh after AI tagging brings new tags; show them unless the owner is typing their own.
  const [savedTags, setSavedTags] = useState(asset.tags.join(', '))
  const incoming = asset.tags.join(', ')
  if (incoming !== savedTags) {
    setSavedTags(incoming)
    if (tags === savedTags) setTags(incoming)
  }

  function saveTags(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    action.run(updateAssetTagsAction, { id: asset.id, tags })
  }

  return (
    <div className="grid gap-5 p-5 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      <div className="overflow-hidden rounded-lg bg-zinc-100">
        <MediaImage src={asset.url} className="max-h-[60vh] w-full object-contain" />
      </div>
      <div className="flex min-w-0 flex-col gap-4">
        <div className="flex items-start justify-between gap-2">
          <div>
            <h2 id="panel-judul" className="text-lg font-semibold text-ink">
              {own ? t('assetPanel.text1') : t('assetPanel.text2')}
            </h2>
            <p className="text-xs text-ink-muted">
              {asset.width}×{asset.height}
              {asset.origin === 'website' && t('assetPanel.text3')}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={t('assetPanel.text4')}
            className="rounded-md p-1.5 text-ink-soft hover:bg-zinc-100 hover:text-ink"
          >
            <X size={18} aria-hidden="true" />
          </button>
        </div>

        {own && (
          <>
            <div className="space-y-1">
              <label htmlFor="panel-produk" className="text-sm font-medium text-ink">
                {t('assetPanel.text5')}</label>
              <div className="flex gap-2">
                <select
                  id="panel-produk"
                  value={groupId}
                  onChange={(event) => setGroupId(event.target.value)}
                  className={FIELD}
                >
                  <option value="">{t('assetPanel.text6')}</option>
                  {groups.map((group) => (
                    <option key={group.id} value={group.id}>
                      {group.title}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  disabled={action.pending || groupId === (asset.groupId ?? '')}
                  onClick={() => action.run(moveAssetsAction, { id: asset.id, groupId })}
                  className={SECONDARY_BUTTON}
                >
                  {t('assetPanel.text7')}</button>
              </div>
            </div>

            <div className="space-y-1">
              <p className="text-sm font-medium text-ink">{t('assetPanel.text8')}</p>
              <button
                type="button"
                disabled={action.pending}
                onClick={() => action.run(setAssetActiveAction, { id: asset.id, active: String(!asset.isActive) })}
                className={`inline-flex min-h-10 items-center gap-2 rounded-lg px-3 text-sm font-medium transition-colors disabled:opacity-60 ${
                  asset.isActive ? 'bg-accent-soft text-accent-deep hover:bg-teal-100' : 'bg-zinc-100 text-zinc-700 hover:bg-zinc-200'
                }`}
              >
                {asset.isActive ? <Pause size={14} aria-hidden="true" /> : <Play size={14} aria-hidden="true" />}
                {asset.isActive ? t('assetPanel.text9') : t('assetPanel.text10')}
              </button>
              <p className="text-xs text-ink-muted">
                {asset.isActive ? t('assetPanel.text11') : t('assetPanel.text12')}
              </p>
            </div>

            <form onSubmit={saveTags} className="space-y-1">
              <label htmlFor="panel-tag" className="text-sm font-medium text-ink">
                {t('assetPanel.text13')}</label>
              <textarea
                id="panel-tag"
                value={tags}
                onChange={(event) => setTags(event.target.value)}
                rows={3}
                placeholder={t('assetPanel.text14')}
                className={`${FIELD} py-2`}
              />
              <p className="text-xs text-ink-muted">
                {t('assetPanel.tagHint', { count: MAX_ASSET_TAGS, limit: TAG_MAX_LENGTH })}</p>
              <div className="flex flex-wrap gap-2 pt-1">
                <button type="submit" disabled={action.pending || tags === savedTags} className={PRIMARY_BUTTON}>
                  {t('assetPanel.text18')}</button>
                <button
                  type="button"
                  disabled={action.pending}
                  onClick={() => action.run(tagAssetsAction, { id: asset.id })}
                  className={SECONDARY_BUTTON}
                >
                  <Sparkles size={14} aria-hidden="true" />
                  {t('assetPanel.text19')}<span className="text-xs text-ink-muted">{t('shared.credits', { count: tagCost(1) })}</span>
                </button>
              </div>
            </form>
          </>
        )}

        <div aria-live="polite">
          {action.pending ? <p className="text-xs text-ink-muted">{t('assetPanel.text20')}</p> : <Feedback state={action.state} />}
        </div>

        <div className="mt-auto border-t border-hairline pt-4">
          <button
            type="button"
            disabled={action.pending}
            onClick={async () => {
              if (await confirmDelete(1, t)) {
                action.run(deleteAssetsAction, { id: asset.id }, (result) => {
                  if (!result.error) onClose()
                })
              }
            }}
            className={DANGER_BUTTON}
          >
            <Trash2 size={14} aria-hidden="true" />
            {t('assetPanel.text21')}</button>
        </div>
      </div>
    </div>
  )
}
