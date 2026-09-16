# Chrome Web Store Privacy Practices — CRRT

Verified against the CRRT implementation on September 11, 2026. Owner/legal review is required before Store submission; code review is not legal approval.

## Privacy policy URL

https://crrt.ai/privacy

## Single purpose

Capture contextual visual feedback on a page the user chooses and route it into CRRT's human-reviewed feedback-to-fix workflow.

## Data handled

- **Personally identifiable information:** account email, account identifier, project membership, and author identity.
- **Authentication information:** CRRT session tokens stored in local extension storage, never Chrome Sync. Passwords are entered only in hosted CRRT and are not handled by the extension.
- **Website content:** the current HTTP(S) URL and hostname when the user opens or activates CRRT; user-authored feedback; explicit element/text anchors and page geometry; and an optional screenshot captured after an explicit feedback action.
- **User activity:** CRRT does not collect browsing history in the background. It stores only the chosen page context required for submitted feedback and authorized destination preferences.
- **Speech input:** the microphone starts only after the user presses it. Chrome or its speech service may process audio. CRRT stores submitted transcript text, not microphone audio.
- **External work:** a configured model provider may receive feedback text and limited page context when an authorized internal collaborator requests an editable tracker draft. GitHub, Linear, or Jira receives the confirmed draft only after that collaborator approves the send.

The full canonical inventory, triggers, visibility, providers, and retention rules are in [`data-use.md`](./data-use.md).

## Limited Use disclosure

CRRT uses data only to authenticate users; resolve authorized project context; capture, store, display, and review feedback; produce a user-requested editable tracker draft; create user-confirmed external work; synchronize its status; send product notifications; and protect and operate the service.

CRRT does not sell user data, use page data for unrelated advertising, collect browsing history in the background, or download and execute remote code inside the extension. Humans do not read private content except when the user shares it for support, when access is required to investigate abuse or a security incident, or when the user authorizes project collaborators through CRRT.

## Sharing and transfers

- Supabase: authentication, database, and protected file storage.
- Vercel: hosting and server execution.
- Resend: invitation and feedback-notification email.
- Operator-configured model provider: limited context for a tracker draft requested by an authorized internal collaborator.
- GitHub, Linear, and Atlassian Jira: the editable draft confirmed by an authorized internal collaborator and the resulting external-work identifiers/status.

Project membership authorizes access. Domain matching only selects among projects the signed-in user may already access. Private feedback remains creator-only; internal project feedback excludes guests.

## Retention and deletion

One-time handoff codes expire after five minutes, and hashed handoff metadata is scheduled for removal after 24 hours. Local data remains until expiry, sign-out, preference change, browser clearing, or uninstall. Feedback, screenshots, and connected-provider records remain until deleted or disconnected by an authorized user, or until an authorized deletion request is completed.

Users can delete feedback they own, disconnect integrations they administer, sign out, and uninstall the extension. Account-level deletion and inaccessible-record requests go to [hello@designproject.io](mailto:hello@designproject.io) from the CRRT account email.

## Security

Service data is sent over HTTPS. Screenshots use protected storage and short-lived signed URLs. Provider credentials, service-role credentials, and raw one-time handoff codes are not included in the extension bundle.

## Contact and support

- Support: https://crrt.ai/support
- Privacy and deletion requests: [hello@designproject.io](mailto:hello@designproject.io)
- Public policy: https://crrt.ai/privacy

Do not include passwords, session tokens, provider secrets, or sensitive page content in the initial support message.
