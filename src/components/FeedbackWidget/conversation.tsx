import { FeedbackAuthor, FeedbackContent, FeedbackSendButton } from './FeedbackParts'
import { getSelector } from '../../lib/getSelector'
import type { ClickTarget, Comment, ConversationComment, FeedbackConversationProps, FeedbackPosition, PersonalComments } from './types'

export function positionAt(target: ClickTarget, clientX: number, clientY: number): ClickTarget {
  const rect = document.querySelector(target.selector)!.getBoundingClientRect()
  const clamp = (value: number) => Math.max(0, Math.min(1, value))
  return { ...target, elementX: rect.width ? clamp((clientX - rect.left) / rect.width) : .5, elementY: rect.height ? clamp((clientY - rect.top) / rect.height) : .5 }
}

export function savedPosition(target: ClickTarget): FeedbackPosition | undefined {
  if (target.elementX === undefined || target.elementY === undefined) return undefined
  return { selector: target.selector, x: target.x, y: target.y, elementX: target.elementX, elementY: target.elementY }
}

export function positionedPoint(target: Pick<ClickTarget, 'selector' | 'elementX' | 'elementY'>) {
  if (target.elementX === undefined || target.elementY === undefined) return null
  const element = document.querySelector(target.selector)
  if (!element) return null
  const rect = element.getBoundingClientRect()
  return { fixedX: rect.left + rect.width * target.elementX, fixedY: rect.top + rect.height * target.elementY }
}

export function conversationSelector(element: Element, containerSelector: string): string {
  const root = document.querySelector(containerSelector)
  if (!root || !root.contains(element)) return getSelector(element)
  const parts: string[] = []
  let current = element
  while (current !== root) {
    const parent = current.parentElement!
    const siblings = [...parent.children].filter(item => item.tagName === current.tagName)
    parts.unshift(`${current.tagName.toLowerCase()}:nth-of-type(${siblings.indexOf(current) + 1})`)
    current = parent
  }
  return parts.length ? `${containerSelector} > ${parts.join(' > ')}` : containerSelector
}

export function conversationTarget(selection: string, containerSelector = 'body', captured?: ClickTarget): ClickTarget {
  if (captured) return captured
  const root = document.querySelector(containerSelector)
  const rect = root?.getBoundingClientRect()
  const target: ClickTarget = {
    selector: root ? containerSelector : 'body',
    x: rect ? (rect.left + rect.width / 2 + window.scrollX) / document.documentElement.scrollWidth * 100 : 50,
    y: rect ? (rect.top + rect.height / 2 + window.scrollY) / document.documentElement.scrollHeight * 100 : 20,
    url: window.location.href,
    elementX: .5,
    elementY: .5,
  }
  if (selection) target.anchor = { kind: 'text_range', selectedText: selection, normalizedText: selection, prefix: '', suffix: '', containerSelector: target.selector, startOffset: 0, endOffset: selection.length, createdFromUrl: target.url }
  return target
}

export function conversationComments(conversation: FeedbackConversationProps, projectId: string): Comment[] {
  return conversation.feedback.filter(item => !item.parentId).map(item => {
    const target = item.target ? { ...item.target, url: window.location.href } : conversationTarget(item.quote, conversation.containerSelector)
    return { ...target, id: item.id, projectId, pageUrl: target.url, body: item.body, authorName: item.author, reviewStatus: item.reviewStatus, editable: false, createdAt: item.createdAt,
      anchor: item.quote ? { kind: 'text_range', selectedText: item.quote, normalizedText: item.quote, prefix: '', suffix: '', containerSelector: target.selector, startOffset: 0, endOffset: item.quote.length, createdFromUrl: target.url } : null,
    }
  })
}

/** Adapter marker keeps project-only actions off the hosted document surface. */
async function unsupportedMutation(): Promise<never> { throw new Error('Use the host mutation') }
export const hostedComments: PersonalComments = { label: 'Feedback', list: async () => [], create: unsupportedMutation, update: unsupportedMutation, remove: unsupportedMutation }

export function ConversationDetails({ conversation, comment, onReply, disabled }: { conversation: FeedbackConversationProps; comment: ConversationComment; onReply(): void; disabled: boolean }) {
  return <div style={{ marginLeft: 32, marginTop: 12, fontSize: 12, color: 'var(--fw-foreground-muted)' }} onClick={event => event.stopPropagation()}>
    {comment.contextLabel && <p>{comment.contextLabel}</p>}
    <p>{comment.implementationStatus === 'unassigned' ? comment.reviewStatus : comment.implementationStatus.replace(/_/g, ' ')}</p>
    {conversation.feedback.filter(item => item.parentId === comment.id).map(reply => <div key={reply.id} style={{ borderLeft: '1px solid var(--fw-contrast-08)', paddingLeft: 12, marginTop: 12 }}><FeedbackAuthor author={reply.author} resolved={false} /><FeedbackContent body={reply.body} resolved={false} /></div>)}
    {Boolean(comment.progressUpdates?.length) && <details style={{ marginTop: 12 }}><summary>Work updates</summary><ol>{comment.progressUpdates!.map((update, index) => <li key={index}><p>{update.agentId} · {update.operation}</p><p style={{ whiteSpace: 'pre-wrap' }}>{update.summary}</p><time dateTime={update.createdAt}>{new Date(update.createdAt).toLocaleString()}</time></li>)}</ol></details>}
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, marginTop: 12 }}>
      {!conversation.readOnly && <button type="button" disabled={disabled || conversation.draftLocked} onClick={onReply} style={{ background: 'transparent', border: 0, color: 'var(--fw-foreground-muted)', cursor: 'pointer' }}>Reply</button>}
      {conversation.onReview && <>{(['accepted','rejected'] as const).map(status => <FeedbackSendButton key={status} type="button" disabled={disabled} onClick={() => conversation.onReview!(comment, status)}>{status === 'accepted' ? 'Accept' : 'Reject'}</FeedbackSendButton>)}<FeedbackSendButton type="button" disabled={disabled} onClick={() => conversation.onReview!(comment, 'accepted', true)}>Done</FeedbackSendButton></>}
    </div>
  </div>
}
