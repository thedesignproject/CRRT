# Record V1 release audit — 2026-11-06

Scope: PR #350 and Pranav's #399–404, integrated with trunk `bcd914c8`.
This report is a local verification record, not a production acceptance claim.

## Included fixes

- Stop captures at five minutes and validate the same limit at the shared contract boundary.
- Expose cloud recording deletion so owners can reclaim quota.
- Expose stage-specific recovery after automatic processing retries are exhausted.
- Cover bare marks and unmatched transcript segments without inventing context.
- Update the visual harness's accepted disclosure version to 3. Require exact popup headings so the disclosure screen cannot incorrectly satisfy signed-in assertions.
- Prepare widget version 0.3.24 and its changelog; npm publication remains pending.

## Verification

- Typecheck passed.
- Full unit/coverage suite: 3,682 passed, 228 skipped. The skipped tests are not counted as verified.
- Changed-line and changed-branch coverage: 100% against trunk and against `record/06-agent` for this follow-up PR. After updating the complete stack, React 18/19 CI (including the mandatory differential coverage gate against each immediate base) passed independently on #350 and #399–404.
- PostgreSQL 18.6 isolated on loopback: applied the complete migration journal through `0050_record_v1.sql`; all 14 Record integration tests passed. Minimal Supabase auth roles/schema/publication were provided as local fixtures. This verifies SQL transactions and migration behavior, not Supabase Auth/REST/Storage.
- Drizzle metadata check passed.
- Widget, dashboard and Chrome-extension production builds passed; the extension build used explicit non-secret CI environment fixtures.
- Visual suite: all 69 captures and all 69 archived replays passed. The source checkpoint now waits for font/layout settlement and identical consecutive screenshots before archival; comparison tolerances are unchanged. Visual TypeScript checks passed.
- GitHub's secret scan initially flagged the literal mock `owner-token` in a test assertion. An exact historical fingerprint exception was added; the secret scan passed on the fix commit. No production credential was added or exposed.

## Remaining release gates

- All branches are updated against current trunk and their immediate bases without force-pushing. The #404 lockfile conflict was resolved with the previously validated integrated lockfile. #399–404 have approvals on their updated heads. #416 is ready for review; the eight PRs are linked as native stack #405.
- #350 and #416 are authored by the current GitHub account and need another reviewer's approval. Trunk requires one approval, current status checks and an up-to-date base; do not bypass protection. An attempted atomic stack merge was rejected for the outstanding approval and pending native `UI Tests` status; nothing was merged.
- `UI Tests` awaits review of changed Chromatic baselines, while capture/replay and publishing pass. The browser-control surface was unavailable in this session, so no baseline approval was performed.
- #350's first npm audit job failed while resolving an unavailable `@tailwindcss/oxide` version, before auditing. The same job passed on retry without changing dependencies.
- Vercel API and CLI both denied access to the `designproject` team. Production environment, storage and deployment state have not been verified or modified.
- Identify/provision the supervised, long-running FFmpeg worker and private storage. Keep `CRRT_RECORD_ENABLED` off until private upload, playback, cleanup and worker smoke tests pass.
- Run the full local Supabase/R2 integration and real Chrome capture, permission, navigation and recovery acceptance flows. Docker is unavailable on this machine; SQL and mocked tests are not substitutes for those flows.
- Keep hosted transcription off until provider policy and consent are approved. Confirm retention and actual Record allowances.
- After merge, publish the widget's exact release commit by tag and verify npm. Build/install or publish the Chrome extension separately; merging the web repository does not update installed extensions.
