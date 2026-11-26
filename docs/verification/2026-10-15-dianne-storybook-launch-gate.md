# Dianne Storybook launch gate — 2026-10-15

This is the exact customer path Dianne can film and a new viewer must be able to repeat. The launch is ready only when every production gate below passes without database edits, copied secrets, or team intervention.

## The product story

CRRT turns visual feedback on a real component into a reviewable code change:

1. Storybook and its MCP expose the component catalog and implementation context to the coding agent.
2. The Agentic Design System repository supplies the product rules and deterministic validation.
3. CRRT captures the human review, preserves the active story and failed-check context, and hands accepted work to Codex or Claude Code.
4. The agent drafts the correction. A human reviews it and the repository checks validate it before merge.

Do not claim that CRRT automatically understands every design-system rule, replaces Storybook, or merges autonomous fixes. CRRT owns the feedback-to-action loop; the repository remains the source of truth for components and rules.

## Filmable happy path

Target length: five to seven minutes.

1. Start on CRRT pricing. Choose **Pro** and a billing cycle.
2. Sign in or create a fresh account. The selected plan and cycle must survive authentication.
3. Complete Stripe Checkout and return to **Billing & usage** with Pro active.
4. Create a private project and choose **Storybook** in the normal project setup card.
5. Copy the single command shown by CRRT and run it from a clean Storybook 10 + React project:

   ```sh
   npx @thedesignproject/crrt-storybook connect --code <one-time-code>
   ```

6. Restart Storybook. Open **Button / Primary** and the **CRRT** panel.
7. Send one manual comment about the component. Then open the deliberately broken icon-only story and send its failed accessible-name check to CRRT.
8. Return to the same CRRT project. Show both items with their Storybook component and story context.
9. Select the accepted work and hand it to Codex or Claude Code from the Agent action.
10. The agent reads the Storybook MCP plus repository rules, makes the correction, and runs the deterministic checks.
11. Show the corrected story and passing check. End on the outcome: feedback became a reviewable fix without rewriting context in a prompt.

## Production launch gates

| Gate | Current evidence | Release requirement |
| --- | --- | --- |
| CRRT Storybook addon | Local package tests pass: 17/17. A packed addon builds in a clean Storybook 10 consumer. | Merge `thedesignproject/crrt-storybook#1` and publish `@thedesignproject/crrt-storybook@0.1.0`. |
| Customer Storybook | Prepared on local branch `feat/crrt-storybook-addon`: the duplicate panel, manager wiring, and preview widget are removed. The packed `0.1.0` addon passes `template-ds` typecheck, Brain/meta validation, lint, and a full Storybook build. | After npm publication, replace the temporary local tarball with pinned `@thedesignproject/crrt-storybook@0.1.0`, commit the lockfile, and rerun the same checks before opening the PR. |
| CRRT onboarding | Dashboard onboarding is implemented in CRRT PR #334. Its not-connected, waiting, connected, auth recovery, upgrade, expiry, retry, clipboard, unsafe URL, stale request, admin-only, and demo-mock paths pass 26/26 focused tests; typecheck and dashboard build pass. | Merge, deploy, and verify pairing states against production. |
| Pricing and Billing Center | Pro/Studio pricing and the Billing Center are implemented in CRRT PR #335. Pricing, loading/error, Checkout continuation, trial, active, past-due, read-only, cancellation, plan-change, Stripe URL, retry, and stale-request paths pass 32/32 focused tests; typecheck plus landing and dashboard builds pass. | Merge after both React 18 and React 19 CI pass; verify a real Checkout return. |
| Billing and entitlement backend | Owned by TDP-5792. | A fresh production user can buy Pro, return entitled, manage billing, and recover from a failed return. |
| Private Storybook backend | Owned by TDP-5793. | Pairing is short-lived and single-use; private feedback requires a signed-in project owner/member and never falls back to the public endpoint. |
| Release and deploy | Owned by TDP-5797. | Production deploy is healthy and both CRRT packages resolve from npm before rehearsal. |

## Automated evidence captured on 2026-10-14

- `crrt-storybook`: 17/17 package tests, typecheck, package-content verification, and a clean-consumer Storybook build pass.
- CRRT PR #334: 26/26 focused onboarding and mock-mode tests, typecheck, and dashboard build pass.
- CRRT PR #335: 32/32 focused pricing and billing tests, typecheck, landing build, and dashboard build pass.
- `template-ds`: the local packed addon replaces the duplicate implementation and passes typecheck, 47 metadata checks, 47 component-document checks, Brain validation, lint, and a full Storybook production build.
- Browser-backed visual QA could not be captured in this environment because no controllable browser session was available. Do not treat the automated evidence above as the final visual sign-off; the Thursday production rehearsal remains required.

## Recording notes

- Keep the Storybook project, terminal, CRRT project, and coding agent open in separate tabs before recording. Avoid waiting on installs or builds in the final cut.
- Use the same private project from pairing through Agent handoff so the continuity is obvious.
- Show the one-command setup only once. Hide the raw connection code after use; it is short-lived and should not become tutorial copy.
- Frame the broken icon-only button and the CRRT panel together, then show the resulting dashboard item before opening the Agent action.
- Capture the corrected Storybook state and passing check as the final proof. Do not end on a terminal command or dashboard loading state.
- Record backup clips only after the production smoke test passes: connected panel, feedback arriving with story context, and dashboard-to-agent handoff.

## Required smoke tests

Run these with a fresh account and a clean clone, not an existing admin session.

- Monthly and yearly Pro selections survive sign-in and reach the correct Checkout price.
- Cancelled Checkout returns safely and can be retried.
- An expired or already-used Storybook code changes no local files and points back to CRRT for a fresh command.
- An interrupted pairing can be retried without duplicate addon registration or stored secrets.
- `crrt-storybook doctor` reports Storybook, package, registration, and connection state.
- Revoked membership or an expired CRRT session fails closed; private feedback is not submitted publicly.
- Manual feedback includes project, story ID, story name, and page URL.
- A failed built-in check includes the failing element, check, and suggested direction.
- The dashboard can accept both items and create one Agent handoff for Codex or Claude Code.
- Billing past-due/read-only states preserve existing work and provide a clear recovery action.

## Thursday rehearsal checklist

- [ ] Merge CRRT PRs #334 and #335.
- [ ] Merge `crrt-storybook` PR #1 and publish version 0.1.0.
- [ ] Complete TDP-5792, TDP-5793, and TDP-5797.
- [ ] Replace the duplicate panel in `template-ds` with the published addon.
- [ ] Run the full happy path once on production with a fresh user.
- [ ] Run the required recovery tests above.
- [ ] Record two short backup clips: the connected CRRT panel and the dashboard-to-agent handoff.
- [ ] Keep one known-good private demo project and one clean Storybook clone ready for Friday.

If any production gate is still red, do not imply that the paid self-serve path is live. Dianne can still explain the workflow using the verified connected demo, but the installation or payment step must be described as beta until the real production path passes.

## Suggested narration

> Storybook gives the coding agent the real component catalog. The repository gives it the design rules and checks. CRRT adds the missing human loop: I can review the rendered component, send precise feedback with its story context, approve the work, and hand it to Codex or Claude Code as a fix to review.

The before/after should use one obvious defect—an icon-only button without an accessible name—so the audience can see the full loop without needing a long explanation of the underlying architecture.
