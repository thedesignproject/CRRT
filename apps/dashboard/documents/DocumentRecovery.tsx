import type { DocumentComment, DocumentTarget } from '../../../shared/documents'
import type { DocumentSelection } from './DocumentBody'

export type FeedbackDraft = { body: string; author: string; reply: Pick<DocumentComment, 'id' | 'revision' | 'author'> | null; target?: DocumentTarget; selection?: DocumentSelection }
