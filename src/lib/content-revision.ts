/** A small, deterministic generation fingerprint; excludes captions and signed media URLs. */
export interface ContentRevisionRow {
  id: string
  updated_at: string
  post_slides: { id: string; status: string; updated_at: string }[]
  content_jobs: { kind: string; status: string } | { kind: string; status: string }[] | null
}

export function contentRevision(row: ContentRevisionRow): string {
  const job = Array.isArray(row.content_jobs) ? row.content_jobs[0] : row.content_jobs
  return JSON.stringify([
    row.updated_at,
    job ? [job.kind, job.status] : null,
    row.post_slides.map((slide) => [slide.id, slide.status, slide.updated_at]).sort((a, b) => a[0].localeCompare(b[0])),
  ])
}
