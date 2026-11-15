import type { TextRangeAnchor } from '../../lib/textAnchor'
import type { ScreenshotFocusRect } from '../../lib/screenshotCapture'

export interface FeedbackWidgetProps {
  projectId: string
  apiBase?: string
  /** Visual theme. `system` follows the browser's preferred color scheme. */
  theme?: 'light' | 'dark' | 'system'
  /** When true, the widget renders nothing and registers no listeners. */
  disabled?: boolean
  /** Private, account-owned comments supplied by the browser extension. */
  personalComments?: PersonalComments
  /** Signed-in extension identity; never taken from the visited website. */
  viewerEmail?: string
  /** Page interaction supplied by an isolated browser-extension frame. */
  page?: WidgetPage
  /** Launch the Chrome-extension recorder. Embedded widgets omit this and show the shortcut handoff. */
  onRecord?: () => void | Promise<void>
  /** Host-owned feedback data for the standard launcher, pins, composer, and sidebar. */
  conversation?: FeedbackConversationProps
}

export interface ConversationDraft {
  body: string
  author: string
  reply: { id: string; version: number; author: string } | null
  target?: FeedbackPosition
}

export interface FeedbackPosition {
  selector: string
  x: number
  y: number
  elementX: number
  elementY: number
}

export interface ConversationComment {
  id: string
  parentId: string | null
  version: number
  body: string
  author: string
  quote: string
  createdAt: string
  target?: FeedbackPosition | null
  contextLabel?: string
  reviewStatus: ReviewStatus
  implementationStatus: string
  progressUpdates?: { createdAt: string; agentId: string; operation: string; summary: string }[]
}

export interface FeedbackConversationProps {
  /** Restrict capture to the host's content rather than its surrounding controls. */
  containerSelector?: string
  feedback: ConversationComment[]
  selection: string
  /** Actual range captured by the host, avoiding ambiguous text searches. */
  selectionTarget?: ClickTarget
  onClearSelection(): void
  onComment(input: { body: string; author: string; parentId?: string; version?: number; target?: FeedbackPosition }): Promise<void>
  onReview?(comment: ConversationComment, status: 'accepted' | 'rejected', done?: boolean): void
  authorName?: string
  onPendingChange?(pending: boolean): void
  onDiscard?(): void
  disabled?: boolean
  draftLocked?: boolean
  initialDraft?: ConversationDraft
  onDraftChange?(draft: ConversationDraft | null): void
  concealed?: boolean
  readOnly?: boolean
  errorMessage(error: unknown): string
}

export interface WidgetPage {
  url: string
  width: number
  height: number
  scrollX: number
  scrollY: number
  target?: ClickTarget
  liveIds: string[]
  embeddedProjectIds?: string[]
  capture(focus: ScreenshotFocusRect | null): Promise<Blob | null>
  selecting(value: boolean): void
  track(comments: { id: string; selector: string; x: number; y: number }[]): void
  highlight(selector: string): void
  focusEmbedded?(projectId: string): void
  /** Hide the browser-extension surface for the current tab. */
  hide?(): void
}

export interface PersonalComments {
  /** Sidebar label for this authenticated extension context. */
  label?: string
  /** Visible project audience. Guests receive a locked shared audience. */
  audience?: {
    value: 'shared' | 'internal'
    canChoose: boolean
    onChange?: (visibility: 'shared' | 'internal') => void
  }
  /** Optional project-wide list scope. Pins always remain scoped to the current page. */
  scope?: {
    value: 'page' | 'project'
    onChange(value: 'page' | 'project'): void
  }
  /** Manual external-tracker handoff for authorized project members. */
  externalWork?: {
    providers: Array<'github' | 'linear' | 'jira'>
    prepare(provider: 'github' | 'linear' | 'jira', commentId: string): Promise<{ destination: string; title: string; body: string; existingUrl?: string }>
    send(provider: 'github' | 'linear' | 'jira', commentId: string, draft: { title: string; body: string }): Promise<{ issueUrl: string }>
  }
  /** Return false when the extension opens sign-in instead of the launcher. */
  beforeOpen?(): Promise<boolean>
  list(pageUrl: string): Promise<Comment[]>
  create(payload: Record<string, unknown>): Promise<Comment>
  update(id: string, body: string): Promise<unknown>
  remove(id: string): Promise<void>
}

export type Mode = 'idle' | 'selecting' | 'commenting'
export type ReviewStatus = 'open' | 'accepted' | 'rejected'
export type CommentTargetType = 'element_point' | 'text_range'

export interface ClickTarget {
  selector: string
  x: number
  y: number
  url: string
  targetType?: CommentTargetType
  anchor?: TextRangeAnchor
  elementX?: number
  elementY?: number
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
  visibility?: 'shared' | 'internal'
  /** Authenticated adapters can mark feedback from other authors as read-only. */
  editable?: boolean
  imageUrl?: string | null
  createdAt: string
  authorName?: string
  targetType?: CommentTargetType
  anchor?: TextRangeAnchor | null
  elementX?: number
  elementY?: number
}
