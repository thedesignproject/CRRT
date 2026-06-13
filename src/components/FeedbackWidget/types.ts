export interface FeedbackWidgetProps {
  projectId: string
  apiBase?: string
  /** When true, the widget renders nothing and registers no listeners. */
  disabled?: boolean
}

export type Mode = 'idle' | 'selecting' | 'commenting'
export type ReviewStatus = 'open' | 'accepted' | 'rejected'

export interface ClickTarget {
  selector: string
  x: number
  y: number
  url: string
}

export interface Comment {
  id: string
  projectId: string
  pageUrl: string
  x: number
  y: number
  selector: string
  body: string
  reviewStatus: ReviewStatus
  imageUrl?: string | null
  createdAt: string
  authorName?: string
}
