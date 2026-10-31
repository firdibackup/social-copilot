'use client'

import { Pencil, Plus, Trash2 } from 'lucide-react'
import { useRef, useState, type FormEvent } from 'react'
import { confirmDialog } from '@/components/confirm-dialog'
import { MediaImage } from '@/components/media-image'
import { ASSET_CATEGORIES } from '@/lib/asset-options'
import type { AssetGroup } from '@/lib/assets'
import { createAssetGroupAction, deleteAssetGroupAction, updateAssetGroupAction } from './actions'
import { Feedback, FIELD, PRIMARY_BUTTON, SECONDARY_BUTTON, useAssetAction } from './ui'

interface ProductCardProps {
  groups: AssetGroup[]
  /** Each product's first photo, by group id. */
  covers: Map<string, string>
  /** The product the grid shows, if any. */
  filter: string | null
  onFilter: (groupId: string | null) => void
}

/** The account's products: pick one to see its photos, add, rename or remove one. */
export function ProductCard({ groups, covers, filter, onFilter }: ProductCardProps) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const [editing, setEditing] = useState<AssetGroup | null>(null)
  // A fresh form every time the dialog opens, so a cancelled edit doesn't linger.
  const [opened, setOpened] = useState(0)
  const remove = useAssetAction()

  function open(group: AssetGroup | null) {
    setEditing(group)
    setOpened((count) => count + 1)
    dialogRef.current?.showModal()
  }

  async function confirmRemove(group: AssetGroup) {
    if (!(await confirmDialog({
      title: `Hapus produk "${group.title}"?`,
      description: 'Fotonya tetap tersimpan di Aset.',
      confirmLabel: 'Hapus',
      tone: 'danger',
    }))) return
    remove.run(deleteAssetGroupAction, { id: group.id }, (result) => {
      if (!result.error && filter === group.id) onFilter(null)
    })
  }

  return (
    <section aria-labelledby="produk-judul" className="rounded-xl border border-hairline bg-paper p-4">
      <div className="flex items-center justify-between gap-2">
        <h2 id="produk-judul" className="text-sm font-semibold text-ink">
          Produk
        </h2>
        <button
          type="button"
          onClick={() => open(null)}
          className="inline-flex min-h-9 items-center gap-1 rounded-md px-2 text-sm font-medium text-accent hover:bg-accent-soft hover:text-accent-deep"
        >
          <Plus size={16} aria-hidden="true" />
          Tambah produk
        </button>
      </div>

      {groups.length === 0 ? (
        <p className="mt-2 text-sm text-ink-muted">
          Kelompokkan foto per produk agar AI memakai foto produk yang benar saat membuat konten.
        </p>
      ) : (
        <ul className="mt-3 max-h-96 space-y-1 overflow-y-auto">
          {groups.map((group) => {
            const cover = covers.get(group.id)
            const selected = filter === group.id
            return (
              <li key={group.id} className="group/item flex items-center gap-1">
                <button
                  type="button"
                  aria-pressed={selected}
                  onClick={() => onFilter(selected ? null : group.id)}
                  className={`flex min-w-0 flex-1 items-center gap-3 rounded-lg p-1.5 text-left transition-colors focus-visible:outline-2 focus-visible:outline-accent ${
                    selected ? 'bg-accent-soft' : 'hover:bg-zinc-50'
                  }`}
                >
                  <span className="size-10 shrink-0 overflow-hidden rounded-md bg-zinc-100">
                    {cover && <MediaImage src={cover} className="size-full object-cover" />}
                  </span>
                  <span className="min-w-0">
                    <span className={`block truncate text-sm font-medium ${selected ? 'text-accent-deep' : 'text-ink'}`}>
                      {group.title}
                    </span>
                    <span className="block truncate text-xs text-ink-muted">
                      {group.photoCount} foto
                      {group.category !== 'product' && ` · ${ASSET_CATEGORIES[group.category]}`}
                      {group.origin === 'website' && ' · website'}
                    </span>
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => open(group)}
                  aria-label={`Ubah ${group.title}`}
                  className="rounded-md p-2 text-ink-soft hover:bg-zinc-100 hover:text-ink"
                >
                  <Pencil size={14} aria-hidden="true" />
                </button>
                <button
                  type="button"
                  onClick={() => confirmRemove(group)}
                  disabled={remove.pending}
                  aria-label={`Hapus ${group.title}`}
                  className="rounded-md p-2 text-ink-soft hover:bg-red-50 hover:text-red-700 disabled:opacity-60"
                >
                  <Trash2 size={14} aria-hidden="true" />
                </button>
              </li>
            )
          })}
        </ul>
      )}
      <div className="mt-2">
        <Feedback state={remove.state} />
      </div>

      <dialog
        ref={dialogRef}
        aria-labelledby="produk-form-judul"
        className="m-auto w-[min(30rem,calc(100%-2rem))] rounded-2xl p-0 backdrop:bg-[rgba(20,21,31,0.3)] backdrop:backdrop-blur-[2px]"
      >
        <ProductForm key={opened} group={editing} onClose={() => dialogRef.current?.close()} />
      </dialog>
    </section>
  )
}

function ProductForm({ group, onClose }: { group: AssetGroup | null; onClose: () => void }) {
  const save = useAssetAction()

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const data = new FormData(event.currentTarget)
    save.run(group ? updateAssetGroupAction : createAssetGroupAction, data, (result) => {
      if (!result.error) {
        save.clear()
        onClose()
      }
    })
  }

  return (
    <form onSubmit={submit} className="space-y-4 p-5">
      <h2 id="produk-form-judul" className="text-lg font-semibold text-ink">
        {group ? 'Ubah produk' : 'Tambah produk'}
      </h2>
      {group && <input type="hidden" name="id" value={group.id} />}
      <label className="block space-y-1 text-sm font-medium text-ink">
        <span>Nama</span>
        <input
          name="title"
          required
          maxLength={120}
          defaultValue={group?.title}
          placeholder="Contoh: Kopi Susu Gula Aren"
          className={FIELD}
        />
      </label>
      <label className="block space-y-1 text-sm font-medium text-ink">
        <span>Jenis</span>
        <select name="category" defaultValue={group?.category ?? 'product'} className={FIELD}>
          {Object.entries(ASSET_CATEGORIES).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </label>
      <label className="block space-y-1 text-sm font-medium text-ink">
        <span>Deskripsi</span>
        <textarea
          name="description"
          maxLength={500}
          rows={3}
          defaultValue={group?.description}
          placeholder="Ciri penting yang perlu diketahui AI saat membuat konten."
          className={`${FIELD} py-2`}
        />
      </label>
      <Feedback state={save.state} />
      <div className="flex justify-end gap-2">
        <button type="button" onClick={onClose} className={SECONDARY_BUTTON}>
          Batal
        </button>
        <button type="submit" disabled={save.pending} className={PRIMARY_BUTTON}>
          {save.pending ? 'Menyimpan…' : group ? 'Simpan' : 'Tambah'}
        </button>
      </div>
    </form>
  )
}
