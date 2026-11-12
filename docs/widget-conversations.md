# Hosted feedback conversations

`FeedbackWidget` accepts an optional `conversation` prop for content whose host owns feedback storage and permissions. This adapter uses the existing CRRT launcher, element selection, pins, composer, and review sidebar. It does not select another renderer or replace the widget UI.

```tsx
import { FeedbackWidget, type FeedbackConversationProps } from '@thedesignproject/crrt'

function Feedback({ conversation }: { conversation: FeedbackConversationProps }) {
  return <FeedbackWidget projectId="host-owned" theme="light" conversation={conversation} />
}
```

Supply comments through `feedback` and persist mutations through `onComment` and optional `onReview`. `projectId` is not sent to the project API in this mode. The host must enforce authorization on its API; hiding a control is not an access check.

- `parentId` groups replies beneath their original comment. A reply carries its parent's `version` back to `onComment`.
- `containerSelector` restricts capture to the host's content.
- `target` stores the selector, page coordinates, and position within the clicked element. Save this with the comment and return it in `feedback` so pins survive reloads and track layout changes. `initialDraft.target` preserves the same position during retries and account recovery.
- `selection` supplies the current selected passage. Pass `selectionTarget` with the captured range, selector and pin position; the widget keeps that exact target instead of searching for the first matching text. The host attaches its own anchor and revision when saving a new root comment. `onClearSelection` clears that context after submission or discard.
- `authorName` supplies authenticated identity; anonymous readers can enter their name. The host must derive authenticated authors on the server.
- `readOnly` hides the composer and reply controls. If an unsaved draft exists, the text remains available for copying or explicit discard. Only supply `onReview` to authorized reviewers.
- `disabled` locks controls during another request. `draftLocked` freezes an uncertain submission while allowing retry through the host's idempotent mutation handler.
- `initialDraft`, `onDraftChange`, and `onPendingChange` let the host retain drafts in memory and block navigation while work is pending. The widget writes no conversation drafts to browser storage.
- `concealed` hides selected and reply context after access changes. The host must also clear inaccessible feedback from `feedback`.
- `errorMessage` maps failed submissions to actionable copy; the draft remains intact on failure.

The hosted-document adapter lives in `apps/dashboard/documents/DocumentThreads.tsx` and imports the actual package source entry point. There is no separately installed widget version to update inside the dashboard. Changes to the widget implementation are included in both the dashboard build and npm build. The existing widget appearance stays unchanged; document-specific controls add replies, review state, and work reports inside the standard sidebar.
