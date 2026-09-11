# CRRT extension data use

Verified against the CRRT implementation on September 11, 2026.

## Single purpose

CRRT captures contextual visual feedback on a page the user chooses and routes it into CRRT's human-reviewed feedback-to-fix workflow.

## Data inventory

| Data | Trigger | Use | Visibility and destination |
| --- | --- | --- | --- |
| Account email, account identifier, session, memberships, and role | The user signs in through hosted CRRT | Authenticate the user and enforce project capabilities | CRRT and Supabase; the extension session stays in local extension storage, not Chrome Sync |
| Disclosure version | The user accepts the first-run summary | Require renewed acceptance after a material data-practice change | Local extension storage |
| Current HTTP(S) URL and hostname | The user opens or activates CRRT | Resolve an accessible project and identify feedback context | CRRT services when the signed-in extension requests projects or comments |
| Destination preference | The user chooses a project or Private for a hostname | Restore the authorized destination for that hostname | Local extension storage |
| Feedback text, author, visibility, timestamps, and status | The user submits feedback | Save, display, review, and synchronize feedback | Creator for Private feedback; authorized collaborators for project feedback; internal feedback excludes guests |
| Selected element or text anchor, selector, page geometry, and optional screenshot | The user explicitly selects a target and submits feedback | Restore the contextual pin and provide implementation evidence | Same audience as the feedback; screenshots use protected storage and short-lived signed URLs |
| Speech transcript | The user presses the microphone and submits the resulting feedback | Let the user dictate feedback | Same audience as the submitted feedback; Chrome or its speech service may process audio, while CRRT stores the submitted text and not microphone audio |
| Editable tracker-draft input | An authorized internal collaborator requests a tracker draft | Propose concise issue copy from the feedback and limited page context | The configured model provider; CRRT falls back to deterministic copy when no model is configured |
| Confirmed external-work fields, destination, identifier, URL, and status | An authorized internal collaborator confirms Send to GitHub, Linear, or Jira | Create and synchronize linked work | CRRT and the selected provider |

## Service providers

- Supabase provides authentication, database records, and protected screenshot storage.
- Vercel provides application hosting and server execution.
- Resend delivers invitation and feedback-notification email.
- The operator-configured model provider receives limited feedback context only when an authorized internal collaborator requests an editable tracker draft.
- GitHub, Linear, and Atlassian Jira receive the confirmed draft only when the project has connected that provider and an authorized internal collaborator confirms the send.

Provider credentials and service-role credentials remain on the CRRT server and are not included in the extension bundle.

## Retention and deletion

- One-time extension handoff codes expire after five minutes. Hashed handoff metadata is scheduled for removal after 24 hours.
- Local session and preference data remains until expiry, sign-out, preference change, browser clearing, or uninstall.
- Feedback and protected screenshots remain until the feedback owner deletes them or an authorized deletion request is completed.
- Connected-provider records remain until an authorized project administrator disconnects the provider or an authorized deletion request is completed.

Users can delete feedback they own, disconnect integrations they administer, sign out, and uninstall the extension. Account-level deletion and inaccessible-record requests go to [hello@designproject.io](mailto:hello@designproject.io) from the CRRT account email.

## Non-use commitments

CRRT does not collect browsing history in the background, sell user data, use page data for unrelated advertising, or download and execute remote code inside the extension. Page content and screenshots are captured only after an explicit feedback action. Knowing a page URL does not grant project access.

## Security and contact

CRRT sends service data over HTTPS. Extension screenshots use protected storage and short-lived signed URLs. Private feedback is visible only to its creator; project and internal visibility are enforced by membership and role.

Privacy questions, access/deletion requests, and suspected security incidents: [hello@designproject.io](mailto:hello@designproject.io). Do not include passwords, session tokens, provider secrets, or sensitive page content in the initial message.
