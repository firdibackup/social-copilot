/** Stored references stay stable when a saved script becomes a post. Live status is never stored in chat. */
export interface ScheduleRef {
  kind: 'post' | 'idea'
  id: string
  title: string
}

export const MAX_SCHEDULE_ITEMS = 20
export type ScheduleStage = 'ready' | 'processing' | 'script' | 'blocked' | 'scheduled' | 'gone'

export interface ScheduleItem extends ScheduleRef {
  postId: string | null
  stage: ScheduleStage
  reason: string
  scheduledAt: string | null
  imageCost: number | null
}

export interface ScheduleData {
  items: ScheduleItem[]
  slots: string[]
  planCredits: number
}

export interface ScheduleAssignment {
  postId: string
  at: string
}

export interface ScheduleResult {
  postId: string
  error: string | null
}
