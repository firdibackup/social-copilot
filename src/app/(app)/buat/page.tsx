import type { Metadata } from 'next'
import Link from 'next/link'
import { connection } from 'next/server'
import { Suspense } from 'react'
import { Notice } from '@/components/notice'
import { PostStatusBadge } from '@/components/post-status-badge'
import { listAssets } from '@/lib/assets'
import { getConnection } from '@/lib/connection'
import { describeError, loadErrorMessage } from '@/lib/errors'
import { formatDateTime, formatTime, parseWibInput } from '@/lib/format'
import { firstValue, isUuid, type SearchParams } from '@/lib/params'
import { getPost, type Post } from '@/lib/posts'
import { PostActions } from './post-actions'
import { PostEditor } from './post-editor'

export const metadata: Metadata = { title: 'Buat' }

const DEFAULT_TIME = '09:00'

const OK_MESSAGES: Record<string, string> = {
  draft: 'Draft tersimpan.',
  schedule: 'Post dijadwalkan.',
  now: 'Post masuk antrean dan akan diterbitkan worker dalam 30 detik.',
  cancel: 'Jadwal dibatalkan.',
  retry: 'Post dijadwalkan ulang untuk terbit sekarang.',
  duplicate: 'Salinan dibuat sebagai draft.',
}

const FAILED_MESSAGES: Record<string, string> = {
  cancel: 'Jadwal tidak bisa dibatalkan karena worker sudah mulai memproses post ini.',
  retry: 'Post ini tidak bisa dicoba lagi pada statusnya sekarang.',
  duplicate: 'Post gagal diduplikat. Coba lagi.',
  hapus: 'Post tidak bisa dihapus saat sedang diterbitkan.',
}

interface BuatPageProps {
  searchParams: Promise<SearchParams>
}

export default function BuatPage({ searchParams }: BuatPageProps) {
  return (
    <Suspense fallback={<p className="text-sm text-zinc-500">Memuat editor…</p>}>
      <EditorLoader searchParams={searchParams} />
    </Suspense>
  )
}

async function EditorLoader({ searchParams }: BuatPageProps) {
  const params = await searchParams
  await connection()
  const id = firstValue(params.id)

  let loaded
  try {
    const [post, library, account] = await Promise.all([
      isUuid(id) ? getPost(id) : null,
      listAssets(),
      getConnection(),
    ])
    loaded = { post, library, instagramReady: account?.status === 'active' }
  } catch (error) {
    console.error('[buat] gagal memuat:', describeError(error))
    return <Notice tone="warning">{loadErrorMessage(error)}</Notice>
  }

  const { post, library, instagramReady } = loaded
  if (id && !post) {
    return (
      <div className="space-y-3">
        <Notice tone="error">Post tidak ditemukan. Mungkin sudah dihapus.</Notice>
        <Link href="/kalender?tampilan=daftar" className="text-sm text-zinc-600 underline">
          Kembali ke daftar post
        </Link>
      </div>
    )
  }

  const ok = OK_MESSAGES[firstValue(params.ok) ?? '']
  const failed = FAILED_MESSAGES[firstValue(params.gagal) ?? '']
  const day = firstValue(params.tanggal)
  const defaultSchedule = day && parseWibInput(`${day}T${DEFAULT_TIME}`) ? `${day}T${DEFAULT_TIME}` : ''

  return (
    <div className="space-y-6">
      {ok && <Notice tone="success">{ok}</Notice>}
      {failed && <Notice tone="error">{failed}</Notice>}
      <PostHeader post={post} instagramReady={instagramReady} />
      <PostEditor key={post?.id ?? 'baru'} post={post} library={library} defaultSchedule={defaultSchedule} />
      {post && <PostActions id={post.id} status={post.status} isLocked={post.isLocked} />}
    </div>
  )
}

function PostHeader({ post, instagramReady }: { post: Post | null; instagramReady: boolean }) {
  return (
    <header className="space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-semibold tracking-tight text-zinc-900">{post ? 'Edit post' : 'Post baru'}</h1>
        {post && <PostStatusBadge status={post.status} />}
      </div>
      {post && <StatusNote post={post} />}
      {!instagramReady && post?.status !== 'published' && (
        <Notice tone="warning">
          Instagram belum tersambung atau perlu disambungkan ulang. Post tetap bisa dijadwalkan, tetapi akan gagal terbit
          sampai akun disambungkan di{' '}
          <Link href="/pengaturan" className="underline">
            Pengaturan
          </Link>
          .
        </Notice>
      )}
    </header>
  )
}

function StatusNote({ post }: { post: Post }) {
  const lockedNote = (
    <Notice tone="warning">
      Status percobaan terakhir belum pasti, jadi isi post dikunci agar tidak terbit dua kali. Pilih Coba lagi (worker
      memeriksa Instagram dulu) atau Duplikat untuk mengedit salinannya.
    </Notice>
  )

  switch (post.status) {
    case 'scheduled':
      if (post.lastError && post.nextAttemptAt) {
        return (
          <Notice tone="warning">
            Percobaan ke-{post.attemptCount} gagal: {post.lastError.replace(/[^.!?]$/, '$&.')} Dicoba lagi pukul{' '}
            {formatTime(post.nextAttemptAt)} WIB.
          </Notice>
        )
      }
      return post.scheduledAt ? (
        <p className="text-sm text-zinc-600">Terbit {formatDateTime(post.scheduledAt)}.</p>
      ) : null
    case 'publishing':
      return <p className="text-sm text-zinc-600">Worker sedang menerbitkan post ini.</p>
    case 'published':
      return (
        <p className="text-sm text-zinc-600">
          Terbit {post.publishedAt ? formatDateTime(post.publishedAt) : ''}.{' '}
          {post.permalink ? (
            <a href={post.permalink} target="_blank" rel="noreferrer" className="font-medium text-zinc-900 underline">
              Lihat di Instagram
            </a>
          ) : (
            'Link Instagram tidak tersedia.'
          )}
        </p>
      )
    case 'failed':
      return (
        <div className="space-y-2">
          <Notice tone="error">{post.lastError ?? 'Post gagal terbit.'}</Notice>
          {post.isLocked && lockedNote}
        </div>
      )
    case 'cancelled':
      return post.isLocked ? lockedNote : null
    default:
      return null
  }
}
