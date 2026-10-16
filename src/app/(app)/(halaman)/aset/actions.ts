'use server'

import { refresh } from 'next/cache'
import { requireActiveUser } from '@/lib/auth'
import { AssetInUseError, createAsset, deleteAsset, InvalidImageError, type Asset } from '@/lib/assets'
import { describeError } from '@/lib/errors'
import { isUuid } from '@/lib/params'

export type UploadResult = { asset: Asset } | { error: string }

/** Receives a JPEG already cropped and resized in the browser (see toInstagramJpeg). */
export async function uploadAsset(formData: FormData): Promise<UploadResult> {
  const userId = await requireActiveUser()
  const file = formData.get('file')
  if (!(file instanceof Blob)) return { error: 'File tidak ditemukan.' }

  try {
    return { asset: await createAsset(userId, file, Number(formData.get('width')), Number(formData.get('height'))) }
  } catch (error) {
    if (error instanceof InvalidImageError) return { error: error.message }
    console.error('[aset] unggah gagal:', describeError(error))
    return { error: 'Foto gagal disimpan. Periksa koneksi Supabase.' }
  }
}

/** Returns an error message for the owner, or null after a successful delete. */
export async function deleteAssetAction(_previous: string | null, formData: FormData): Promise<string | null> {
  const userId = await requireActiveUser()
  const id = formData.get('id')
  if (!isUuid(id)) return 'Foto tidak ditemukan.'

  try {
    await deleteAsset(userId, id)
  } catch (error) {
    if (error instanceof AssetInUseError) return error.message
    console.error('[aset] hapus gagal:', describeError(error))
    return 'Foto gagal dihapus. Coba lagi.'
  }
  refresh()
  return null
}
