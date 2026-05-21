export interface FeedbackWidgetProps {
  projectId: string
  apiBase?: string
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
