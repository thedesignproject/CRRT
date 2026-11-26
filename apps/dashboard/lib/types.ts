import type { PromptTarget } from '../hooks/useAgentSession'
import type { CommentTargetType, ExternalWorkRecord, GitHubIssueRecord, TextRangeAnchorRecord } from '../api'

export type ReviewStatus = 'open' | 'accepted' | 'rejected'
export type ImplStatus = 'unassigned' | 'claimed' | 'in_progress' | 'blocked' | 'ready_for_testing' | 'done'
export type StatusFilter = 'all' | 'open' | 'ready' | 'ready_for_testing' | 'done'
export type DisplayStatus = 'open' | 'ready' | 'ready_for_testing' | 'done' | 'rejected'

export interface Comment {
  id: string
  projectId: string
  pageUrl: string | null
  selector: string | null
  x: number | null
  y: number | null
  body: string
  visibility?: 'shared' | 'internal'
  reviewStatus: ReviewStatus
  implementationStatus: ImplStatus
  claimedByAgentId: string | null
  createdAt: string
  updatedAt: string
  author: string
  authorInitial: string
  authorColor: string
  screenshotUrl: string | null
  targetType: CommentTargetType
  anchor: TextRangeAnchorRecord | null
  githubIssue: GitHubIssueRecord | null
  externalWork?: ExternalWorkRecord[]
}

export interface AgentMeta {
  id: string
  name: string
  hint: string
  target: PromptTarget
}

/** Destination-neutral default: a plain prompt any coding agent can take. */
export const PROMPT_AGENT_ID = 'prompt'

export const AGENTS: AgentMeta[] = [
  { id: PROMPT_AGENT_ID, name: 'Copy as prompt', hint: 'Works with any coding agent', target: 'generic' },
  { id: 'claude-code', name: 'Claude Code', hint: 'Paste prompt in chat', target: 'claude-code' },
  { id: 'codex', name: 'Codex', hint: 'Paste prompt in prompt', target: 'codex' },
  { id: 'cursor', name: 'Cursor', hint: 'Paste prompt in composer', target: 'generic' },
  { id: 'windsurf', name: 'Windsurf', hint: 'Paste prompt in Cascade', target: 'generic' },
  { id: 'cline', name: 'Cline', hint: 'Paste prompt in chat', target: 'generic' },
  { id: 'conductor', name: 'Conductor', hint: 'Paste prompt in the workspace chat', target: 'generic' },
]

/** What the handoff button does with the chosen agent, e.g. "Send to Codex" or "Copy as prompt". */
export function agentActionLabel(agent: AgentMeta) {
  return agent.id === PROMPT_AGENT_ID ? agent.name : `Send to ${agent.name}`
}

/** The agent as named in a sentence: "Codex", or "your agent" for the plain prompt, which names no agent. */
export function agentNoun(agent: AgentMeta, sentenceStart = false) {
  if (agent.id !== PROMPT_AGENT_ID) return agent.name
  return sentenceStart ? 'Your agent' : 'your agent'
}

export const AUTHOR_COLORS = ['#6366F1', '#8B5CF6', '#EC4899', '#F59E0B', '#10B981', '#0EA5E9']

export const DISPLAY_STATUS_LABELS: Record<DisplayStatus, string> = {
  open: 'Open',
  ready: 'Agent',
  ready_for_testing: 'Testing',
  done: 'Done',
  rejected: 'Rejected',
}
