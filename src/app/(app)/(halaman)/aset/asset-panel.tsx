'use client'

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
              {own ? 'Ubah foto' : 'Gambar hasil AI'}
            </h2>
            <p className="text-xs text-ink-muted">
              {asset.width}×{asset.height}
              {asset.origin === 'website' && ' · dari website'}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Tutup"
            className="rounded-md p-1.5 text-ink-soft hover:bg-zinc-100 hover:text-ink"
          >
            <X size={18} aria-hidden="true" />
          </button>
        </div>

        {own && (
          <>
            <div className="space-y-1">
              <label htmlFor="panel-produk" className="text-sm font-medium text-ink">
                Produk
              </label>
              <div className="flex gap-2">
                <select
                  id="panel-produk"
                  value={groupId}
                  onChange={(event) => setGroupId(event.target.value)}
                  className={FIELD}
                >
                  <option value="">Tanpa produk</option>
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
                  Pindahkan
                </button>
              </div>
            </div>

            <div className="space-y-1">
              <p className="text-sm font-medium text-ink">Status</p>
              <button
                type="button"
                disabled={action.pending}
                onClick={() => action.run(setAssetActiveAction, { id: asset.id, active: String(!asset.isActive) })}
                className={`inline-flex min-h-10 items-center gap-2 rounded-lg px-3 text-sm font-medium transition-colors disabled:opacity-60 ${
                  asset.isActive ? 'bg-accent-soft text-accent-deep hover:bg-teal-100' : 'bg-zinc-100 text-zinc-700 hover:bg-zinc-200'
                }`}
              >
                {asset.isActive ? <Pause size={14} aria-hidden="true" /> : <Play size={14} aria-hidden="true" />}
                {asset.isActive ? 'Aktif · Jeda' : 'Dijeda · Aktifkan'}
              </button>
              <p className="text-xs text-ink-muted">
                {asset.isActive ? 'AI boleh memakai foto ini.' : 'AI tidak memakai foto ini; tetap bisa dipilih manual untuk post.'}
              </p>
            </div>

            <form onSubmit={saveTags} className="space-y-1">
              <label htmlFor="panel-tag" className="text-sm font-medium text-ink">
                Tag
              </label>
              <textarea
                id="panel-tag"
                value={tags}
                onChange={(event) => setTags(event.target.value)}
                rows={3}
                placeholder="kopi susu, gelas plastik, es"
                className={`${FIELD} py-2`}
              />
              <p className="text-xs text-ink-muted">
                Pisahkan dengan koma. Maksimal {MAX_ASSET_TAGS} tag, masing-masing {TAG_MAX_LENGTH} karakter.
              </p>
              <div className="flex flex-wrap gap-2 pt-1">
                <button type="submit" disabled={action.pending || tags === savedTags} className={PRIMARY_BUTTON}>
                  Simpan tag
                </button>
                <button
                  type="button"
                  disabled={action.pending}
                  onClick={() => action.run(tagAssetsAction, { id: asset.id })}
                  className={SECONDARY_BUTTON}
                >
                  <Sparkles size={14} aria-hidden="true" />
                  Buat dengan AI
                  <span className="text-xs text-ink-muted">({tagCost(1)} kredit)</span>
                </button>
              </div>
            </form>
          </>
        )}

        <div aria-live="polite">
          {action.pending ? <p className="text-xs text-ink-muted">Memproses…</p> : <Feedback state={action.state} />}
        </div>

        <div className="mt-auto border-t border-hairline pt-4">
          <button
            type="button"
            disabled={action.pending}
            onClick={() => {
              if (confirmDelete(1)) {
                action.run(deleteAssetsAction, { id: asset.id }, (result) => {
                  if (!result.error) onClose()
                })
              }
            }}
            className={DANGER_BUTTON}
          >
            <Trash2 size={14} aria-hidden="true" />
            Hapus foto
          </button>
        </div>
      </div>
    </div>
  )
}
