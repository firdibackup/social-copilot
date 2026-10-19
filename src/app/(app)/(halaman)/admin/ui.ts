/** Class names and labels shared by the admin pages. */

export const CARD = 'space-y-4 rounded-xl border border-zinc-200 bg-white p-5'
export const CARD_TITLE = 'text-sm font-semibold text-zinc-900'
export const LABEL = 'block space-y-1 text-sm font-medium text-zinc-900'
export const HINT = 'text-xs font-normal text-zinc-500'
export const FIELD =
  'block w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm font-normal text-zinc-900 focus:outline-none'
export const PRIMARY_BUTTON =
  'inline-flex items-center justify-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-primary-hover disabled:opacity-50'
export const BUTTON =
  'inline-flex items-center justify-center gap-1.5 rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm font-medium text-zinc-800 hover:bg-zinc-50 disabled:opacity-50'
export const DANGER_BUTTON =
  'inline-flex items-center justify-center gap-1.5 rounded-lg border border-red-200 bg-white px-3 py-2 text-sm font-medium text-red-700 hover:bg-red-50 disabled:opacity-50'
export const TABLE = 'w-full text-left text-sm'
export const TH = 'px-4 py-2 text-xs font-medium tracking-wide text-zinc-500 uppercase'
export const TD = 'px-4 py-3 align-top'

/** What each logged AI task is, for people. */
export const TASK_LABELS: Record<string, string> = {
  content: 'Konten baru',
  content_slide: 'Slide konten',
  slide_edit: 'Edit slide',
  caption_edit: 'Edit caption',
  content_ideas: 'Ide konten',
  content_script: 'Skrip konten',
  brand_profile: 'Profil brand',
  brand_visual: 'Gaya visual',
  website_catalog: 'Katalog website',
  asset_tags: 'Tag foto',
  reply_draft: 'Draf balasan',
}

export const ACTION_LABELS: Record<string, string> = {
  grant_days: 'Tambah masa aktif',
  end_subscription: 'Hentikan langganan',
  adjust_credits: 'Ubah kredit',
  reset_credits: 'Reset kredit',
  set_password: 'Ganti password',
  ban: 'Blokir akun',
  unban: 'Buka blokir',
  delete_user: 'Hapus pengguna',
  save_settings: 'Simpan pengaturan',
}
