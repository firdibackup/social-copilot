'use client'

import { Check, Pause, Play, Sparkles, Tag, Trash2, X } from 'lucide-react'
import { useRef, useState } from 'react'
import { MediaImage } from '@/components/media-image'
import type { Asset, AssetGroup, AssetLibrary } from '@/lib/assets'
import { tagCost } from '@/lib/billing-options'
import { deleteAssetsAction, moveAssetsAction, setAssetActiveAction, tagAssetsAction } from './actions'
import { AssetPanel } from './asset-panel'
import { ProductCard } from './product-card'
import { confirmDelete, DANGER_BUTTON, Feedback, FIELD, SECONDARY_BUTTON, useAssetAction } from './ui'
import { UploadZone } from './upload-zone'
import { WebsiteCard } from './website-card'

type Tab = 'mine' | 'ai'

const MAX_VISIBLE_TAGS = 3

/** Photos of one product in their product order, so "Image N" matches what AI is sent. */
const byPosition = (left: Asset, right: Asset) =>
  (left.groupPosition ?? Number.MAX_SAFE_INTEGER) - (right.groupPosition ?? Number.MAX_SAFE_INTEGER)

interface AssetLibraryViewProps {
  rates: { asset_tags: number; website_catalog: number }
  library: AssetLibrary
  /** The website saved in Brand, or ''. */
  websiteUrl: string
}

export function AssetLibraryView({ library, websiteUrl, rates }: AssetLibraryViewProps) {
  const [tab, setTab] = useState<Tab>('mine')
  const [filter, setFilter] = useState<string | null>(null)
  const [picked, setPicked] = useState<Set<string>>(new Set())
  const [editingId, setEditingId] = useState<string | null>(null)
  const panelRef = useRef<HTMLDialogElement>(null)

  const groupById = new Map(library.groups.map((group) => [group.id, group]))
  const activeFilter = filter && groupById.has(filter) ? filter : null
  const filterGroup = activeFilter ? groupById.get(activeFilter) : undefined
  const assets =
    tab === 'ai'
      ? library.ai
      : activeFilter
        ? library.mine.filter((asset) => asset.groupId === activeFilter).sort(byPosition)
        : library.mine
  // Photos that left the view (deleted, moved out of the filtered product) drop out of the selection.
  const selected = assets.filter((asset) => picked.has(asset.id)).map((asset) => asset.id)
  const covers = new Map<string, string>()
  for (const asset of [...library.mine].sort(byPosition)) {
    if (asset.groupId && !covers.has(asset.groupId)) covers.set(asset.groupId, asset.url)
  }
  const editing = [...library.mine, ...library.ai].find((asset) => asset.id === editingId) ?? null

  function toggle(id: string) {
    setPicked((current) => {
      const next = new Set(current)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function switchTab(next: Tab) {
    setTab(next)
    setPicked(new Set())
  }

  function openPanel(id: string) {
    setEditingId(id)
    panelRef.current?.showModal()
  }

  return (
    <div className="space-y-5">
      <div role="tablist" aria-label="Jenis aset" className="flex gap-1 border-b border-hairline">
        {(
          [
            ['mine', 'Milik saya', library.mine.length],
            ['ai', 'Hasil AI', library.ai.length],
          ] as const
        ).map(([value, label, count]) => (
          <button
            key={value}
            type="button"
            role="tab"
            aria-selected={tab === value}
            onClick={() => switchTab(value)}
            className={`-mb-px inline-flex items-center gap-1.5 border-b-2 px-3 py-2.5 text-sm font-medium transition-colors ${
              tab === value ? 'border-accent text-accent-deep' : 'border-transparent text-ink-muted hover:text-ink'
            }`}
          >
            {value === 'ai' && <Sparkles size={14} aria-hidden="true" />}
            {label}
            <span className="text-xs text-ink-soft">{count}</span>
          </button>
        ))}
      </div>

      {tab === 'mine' ? (
        <div className="grid gap-5 lg:grid-cols-[17rem_minmax(0,1fr)]">
          <aside className="space-y-4">
            <ProductCard
              groups={library.groups}
              covers={covers}
              filter={activeFilter}
              onFilter={(groupId) => {
                setFilter(groupId)
                setPicked(new Set())
              }}
            />
            <WebsiteCard websiteUrl={websiteUrl} creditCost={rates.website_catalog} />
          </aside>
          <div className="min-w-0 space-y-4">
            <UploadZone groups={library.groups} defaultGroupId={activeFilter} creditCost={rates.asset_tags} />
            {filterGroup && (
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <span className="text-ink-muted">Produk:</span>
                <span className="font-medium text-ink">{filterGroup.title}</span>
                <button
                  type="button"
                  onClick={() => setFilter(null)}
                  className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-xs font-medium text-accent hover:bg-accent-soft"
                >
                  <X size={12} aria-hidden="true" />
                  Tampilkan semua
                </button>
              </div>
            )}
            <PhotoGrid
              tab={tab}
              assets={assets}
              groups={library.groups}
              groupById={groupById}
              numbered={activeFilter !== null}
              selected={selected}
              onToggle={toggle}
              onSelectAll={(all) => setPicked(new Set(all ? assets.map((asset) => asset.id) : []))}
              onOpen={openPanel}
              emptyText={
                filterGroup
                  ? 'Produk ini belum berisi foto. Unggah foto di atas, atau pilih foto lalu Masukkan ke produk.'
                  : 'Belum ada foto. Unggah foto pertama untuk mulai membuat post.'
              }
            />
          </div>
        </div>
      ) : (
        <PhotoGrid
          tab={tab}
          assets={assets}
          groups={library.groups}
          groupById={groupById}
          numbered={false}
          selected={selected}
          onToggle={toggle}
          onSelectAll={(all) => setPicked(new Set(all ? assets.map((asset) => asset.id) : []))}
          onOpen={openPanel}
          emptyText="Belum ada gambar hasil AI. Gambar slide dari Buat Konten akan muncul di sini."
        />
      )}

      <dialog
        ref={panelRef}
        aria-labelledby="panel-judul"
        onClose={() => setEditingId(null)}
        className="m-auto w-[min(44rem,calc(100%-2rem))] rounded-2xl p-0 backdrop:bg-[rgba(20,21,31,0.3)] backdrop:backdrop-blur-[2px]"
      >
        {editing && (
          <AssetPanel
            key={editing.id}
            asset={editing}
            groups={library.groups}
            onClose={() => panelRef.current?.close()}
          />
        )}
      </dialog>
    </div>
  )
}

interface PhotoGridProps {
  tab: Tab
  assets: Asset[]
  groups: AssetGroup[]
  groupById: Map<string, AssetGroup>
  /** Label photos "Image N", as inside one product. */
  numbered: boolean
  selected: string[]
  onToggle: (id: string) => void
  onSelectAll: (all: boolean) => void
  onOpen: (id: string) => void
  emptyText: string
}

function PhotoGrid(props: PhotoGridProps) {
  const { tab, assets, groups, groupById, numbered, selected, onToggle, onSelectAll, onOpen, emptyText } = props
  const action = useAssetAction()
  if (assets.length === 0) {
    return <p className="rounded-xl border border-dashed border-zinc-300 p-8 text-center text-sm text-ink-muted">{emptyText}</p>
  }
  const allSelected = selected.length === assets.length
  return (
    <section aria-label="Foto" className="space-y-3">
      <div className="flex min-h-9 items-center justify-between gap-3">
        <label className="flex items-center gap-2 text-sm text-ink-muted">
          <input
            type="checkbox"
            checked={allSelected}
            ref={(input) => {
              if (input) input.indeterminate = selected.length > 0 && !allSelected
            }}
            onChange={(event) => onSelectAll(event.target.checked)}
            className="size-4 accent-teal-700"
          />
          Pilih semua ({assets.length})
        </label>
        {tab === 'mine' && <p className="hidden text-xs text-ink-soft sm:block">Foto yang dijeda tidak dipakai AI.</p>}
      </div>
      {selected.length > 0 && <BulkBar tab={tab} ids={selected} groups={groups} action={action} onClear={() => onSelectAll(false)} />}
      {selected.length === 0 && <Feedback state={action.state} />}
      <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
        {assets.map((asset, index) => (
          <AssetTile
            key={asset.id}
            asset={asset}
            label={numbered ? `Image ${index + 1}` : null}
            product={tab === 'mine' && !numbered && asset.groupId ? (groupById.get(asset.groupId)?.title ?? null) : null}
            checked={selected.includes(asset.id)}
            onToggle={() => onToggle(asset.id)}
            onOpen={() => onOpen(asset.id)}
          />
        ))}
      </ul>
    </section>
  )
}

interface AssetTileProps {
  asset: Asset
  label: string | null
  product: string | null
  checked: boolean
  onToggle: () => void
  onOpen: () => void
}

function AssetTile({ asset, label, product, checked, onToggle, onOpen }: AssetTileProps) {
  const own = asset.origin !== 'ai'
  const paused = own && !asset.isActive
  const extraTags = asset.tags.length - MAX_VISIBLE_TAGS
  return (
    <li className="min-w-0">
      <div
        className={`group/tile relative overflow-hidden rounded-lg bg-zinc-100 ring-2 transition-shadow ${
          checked ? 'ring-accent' : 'ring-transparent'
        }`}
      >
        <button type="button" onClick={onOpen} className="block w-full focus-visible:outline-2 focus-visible:outline-accent">
          <MediaImage src={asset.url} className={`aspect-square w-full object-cover ${paused ? 'opacity-50' : ''}`} />
          <span className="sr-only">Ubah foto{label ? ` ${label}` : ''}</span>
        </button>
        <label
          className={`absolute top-2 left-2 flex size-7 cursor-pointer items-center justify-center rounded-md border transition-colors ${
            checked
              ? 'border-accent bg-accent text-white'
              : 'border-white/80 bg-zinc-950/30 text-transparent opacity-100 sm:opacity-0 sm:group-hover/tile:opacity-100 has-focus-visible:opacity-100'
          }`}
        >
          <input type="checkbox" checked={checked} onChange={onToggle} className="sr-only" />
          <Check size={16} aria-hidden="true" />
          <span className="sr-only">Pilih foto</span>
        </label>
        <div className="pointer-events-none absolute right-2 bottom-2 left-2 flex flex-wrap items-end justify-between gap-1">
          {label && <span className="rounded bg-zinc-950/75 px-1.5 py-0.5 text-xs font-medium text-white">{label}</span>}
          {paused && (
            <span className="ml-auto inline-flex items-center gap-1 rounded bg-zinc-950/75 px-1.5 py-0.5 text-xs font-medium text-white">
              <Pause size={12} aria-hidden="true" />
              Dijeda
            </span>
          )}
        </div>
      </div>
      {(product || asset.tags.length > 0) && (
        <div className="mt-1.5 space-y-1">
          {product && <p className="truncate text-xs font-medium text-ink">{product}</p>}
          {asset.tags.length > 0 && (
            <ul className="flex flex-wrap gap-1" aria-label="Tag">
              {asset.tags.slice(0, MAX_VISIBLE_TAGS).map((tag) => (
                <li key={tag} className="max-w-full truncate rounded-full bg-zinc-100 px-2 py-0.5 text-xs text-ink-muted">
                  {tag}
                </li>
              ))}
              {extraTags > 0 && <li className="px-1 py-0.5 text-xs text-ink-soft">+{extraTags}</li>}
            </ul>
          )}
        </div>
      )}
    </li>
  )
}

interface BulkBarProps {
  tab: Tab
  ids: string[]
  groups: AssetGroup[]
  /** Owned by the grid, so the result stays in view after the selection clears. */
  action: ReturnType<typeof useAssetAction>
  onClear: () => void
}

/** What the selected photos can do at once. AI results can only be deleted: AI never uses them as product photos. */
function BulkBar({ tab, ids, groups, action, onClear }: BulkBarProps) {
  const [target, setTarget] = useState('')
  const clearOnSuccess = (result: { error: string | null }) => {
    if (!result.error) onClear()
  }

  return (
    <div className="sticky top-0 z-10 space-y-1 rounded-xl border border-hairline bg-paper/95 p-2 shadow-sm backdrop-blur">
      <div className="flex flex-wrap items-center gap-2">
        <span className="px-2 text-sm font-semibold text-ink">{ids.length} dipilih</span>
        {tab === 'mine' && (
          <>
            <div className="flex items-center gap-1">
              <label className="sr-only" htmlFor="bulk-produk">
                Masukkan ke produk
              </label>
              <select
                id="bulk-produk"
                value={target}
                onChange={(event) => setTarget(event.target.value)}
                className={`${FIELD} max-w-44 min-h-9`}
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
                disabled={action.pending}
                onClick={() => action.run(moveAssetsAction, { id: ids, groupId: target }, clearOnSuccess)}
                className={`${SECONDARY_BUTTON} min-h-9`}
              >
                {target ? 'Masukkan' : 'Keluarkan'}
              </button>
            </div>
            <button
              type="button"
              disabled={action.pending}
              onClick={() => action.run(setAssetActiveAction, { id: ids, active: 'true' })}
              className={`${SECONDARY_BUTTON} min-h-9`}
            >
              <Play size={14} aria-hidden="true" />
              Aktifkan
            </button>
            <button
              type="button"
              disabled={action.pending}
              onClick={() => action.run(setAssetActiveAction, { id: ids, active: 'false' })}
              className={`${SECONDARY_BUTTON} min-h-9`}
            >
              <Pause size={14} aria-hidden="true" />
              Jeda
            </button>
            <button
              type="button"
              disabled={action.pending}
              onClick={() => action.run(tagAssetsAction, { id: ids })}
              className={`${SECONDARY_BUTTON} min-h-9`}
            >
              <Tag size={14} aria-hidden="true" />
              Buat tag AI
              <span className="text-xs text-ink-muted">({tagCost(ids.length)} kredit)</span>
            </button>
          </>
        )}
        <button
          type="button"
          disabled={action.pending}
          onClick={() => {
            if (confirmDelete(ids.length)) action.run(deleteAssetsAction, { id: ids }, clearOnSuccess)
          }}
          className={`${DANGER_BUTTON} min-h-9`}
        >
          <Trash2 size={14} aria-hidden="true" />
          Hapus
        </button>
        <button
          type="button"
          onClick={onClear}
          className="ml-auto inline-flex min-h-9 items-center gap-1 rounded-lg px-2 text-sm text-ink-muted hover:bg-zinc-100 hover:text-ink"
        >
          <X size={14} aria-hidden="true" />
          Batal pilih
        </button>
      </div>
      <div aria-live="polite" className="px-2">
        {action.pending ? <p className="text-xs text-ink-muted">Memproses…</p> : <Feedback state={action.state} />}
      </div>
    </div>
  )
}
