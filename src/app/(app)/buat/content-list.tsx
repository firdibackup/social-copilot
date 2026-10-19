import { Lightbulb, Plus } from 'lucide-react'
import Link from 'next/link'
import type { ReactNode } from 'react'
import { MediaImage } from '@/components/media-image'
import { formatShortDate, formatTime } from '@/lib/format'
import type { Idea } from '@/lib/ideas'
import { STATUS_LABELS } from '@/lib/post-status'
import type { ContentListItem } from '@/lib/posts'
import { DeleteIdeaButton, FindIdeasButton } from './idea-buttons'

/** Hover and focus reach past the text, which stays aligned with the section labels. */
const ITEM =
  '-mx-2 flex w-[calc(100%+1rem)] items-center gap-3 rounded-lg px-2 py-2 text-left transition-colors hover:bg-[#f7f7f8] focus-visible:ring-2 focus-visible:ring-ink/20 focus-visible:outline-none'
const ACTIVE = 'bg-[#f4f4f5] hover:bg-[#f4f4f5]'

interface ContentListProps {
  posts: ContentListItem[]
  ideas: Idea[]
  selectedId: string | null
  selectedIdeaId: string | null
  /** e.g. "0,2%", what one round of ideas costs. */
  className: string
}

function meta(post: ContentListItem): string {
  const parts = [`${post.slideCount} slide`]
  if (post.inProgress > 0) parts.push('sedang dibuat')
  else if (post.status === 'scheduled' && post.scheduledAt) {
    parts.push(`terbit ${formatShortDate(post.scheduledAt)} ${formatTime(post.scheduledAt)}`)
  } else if (post.status !== 'draft') parts.push(STATUS_LABELS[post.status].toLowerCase())
  return parts.join(' · ')
}

/** Buat's left column: the posts still worth editing and the AI's ideas for new ones. */
export function ContentList({ posts, ideas, selectedId, selectedIdeaId, className }: ContentListProps) {
  return (
    <aside aria-label="Daftar konten" className={`${className} min-h-0 w-full shrink-0 flex-col md:w-[320px] md:border-r md:border-hairline`}>
      <div className="px-4 pt-3 pb-2">
        <Link
          href="/buat?baru=1"
          className="flex h-10 items-center justify-center gap-2 rounded-xl bg-accent text-sm font-semibold text-white transition-colors hover:bg-accent-deep"
        >
          <Plus size={16} aria-hidden="true" />
          Konten baru
        </Link>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-4 pt-1 pb-5">
        <ListSection title="Post jadi" count={posts.length}>
          {posts.length === 0 ? (
            <p className="py-2 text-sm text-ink-muted">Belum ada post. Mulai dari ide di bawah, atau tulis topik sendiri.</p>
          ) : (
            <ul>
              {posts.map((post) => (
                <li key={post.id}>
                  <Link
                    href={`/buat?id=${post.id}`}
                    aria-current={post.id === selectedId ? 'page' : undefined}
                    className={`${ITEM} ${post.id === selectedId ? ACTIVE : ''}`}
                  >
                    {post.coverUrl ? (
                      <MediaImage src={post.coverUrl} className="size-12 shrink-0 rounded-lg bg-zinc-100 object-cover" />
                    ) : (
                      <span className={`size-12 shrink-0 rounded-lg ${post.inProgress > 0 ? 'shimmer' : 'bg-zinc-100'}`} />
                    )}
                    <span className="min-w-0">
                      <span className="line-clamp-2 text-[14px] leading-snug font-semibold text-ink">{post.label}</span>
                      <span className="mt-0.5 block text-xs text-ink-muted">{meta(post)}</span>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </ListSection>

        <ListSection title="Ide" count={ideas.length} action={<FindIdeasButton />}>
          {ideas.length === 0 ? (
            <p className="py-2 text-sm text-ink-muted">Pilih Cari ide: AI menyusun 10 ide dari Brand Anda.</p>
          ) : (
            <ul>
              {ideas.map((idea) => (
                <li key={idea.id} className="group relative">
                  <Link
                    href={`/buat?ide=${idea.id}`}
                    aria-current={idea.id === selectedIdeaId ? 'page' : undefined}
                    className={`${ITEM} pr-9 ${idea.id === selectedIdeaId ? ACTIVE : ''}`}
                  >
                    <span className="flex size-12 shrink-0 items-center justify-center rounded-xl border border-hairline bg-white text-ink-muted">
                      <Lightbulb size={18} strokeWidth={1.75} aria-hidden="true" />
                    </span>
                    <span className="min-w-0">
                      <span className="block text-[14px] leading-snug font-medium text-ink">{idea.title}</span>
                      {idea.script && <span className="mt-0.5 block text-xs text-ink-muted">Skrip siap · {idea.script.length} slide</span>}
                    </span>
                  </Link>
                  <DeleteIdeaButton id={idea.id} />
                </li>
              ))}
            </ul>
          )}
        </ListSection>
      </div>
    </aside>
  )
}

function ListSection({ title, count, action, children }: { title: string; count: number; action?: ReactNode; children: ReactNode }) {
  return (
    <section className="mt-3 first:mt-0">
      <div className="flex items-center gap-2 border-b border-hairline pt-2 pb-2">
        <h2 className="text-[11px] font-medium tracking-wide text-ink-muted uppercase">{title}</h2>
        <span className="text-[11px] text-ink-muted">{count}</span>
        {action && <div className="ml-auto">{action}</div>}
      </div>
      <div className="pt-1">{children}</div>
    </section>
  )
}
