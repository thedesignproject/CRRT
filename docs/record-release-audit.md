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
- Changed-line and changed-branch coverage: 100% against trunk and against `record/06-agent` for this follow-up PR. This does not establish independent coverage for each lower stack layer.
- PostgreSQL 18.6 isolated on loopback: applied the complete migration journal through `0050_record_v1.sql`; all 14 Record integration tests passed. Minimal Supabase auth roles/schema/publication were provided as local fixtures. This verifies SQL transactions and migration behavior, not Supabase Auth/REST/Storage.
- Drizzle metadata check passed.
- Widget, dashboard and Chrome-extension production builds passed; the extension build used explicit non-secret CI environment fixtures.
- Visual suite: all 69 captures and all 69 archived replays passed. The source checkpoint now waits for font/layout settlement and identical consecutive screenshots before archival; comparison tolerances are unchanged. Visual TypeScript checks passed.
- GitHub's secret scan initially flagged the literal mock `owner-token` in a test assertion. An exact historical fingerprint exception was added; the secret scan passed on the fix commit. No production credential was added or exposed.

## Remaining release gates

- #350 is authored by the current GitHub account and needs another reviewer's approval. Trunk requires one approval, current status checks and an up-to-date base; do not bypass protection.
- Each original stack layer still needs its own current CI and differential coverage results before merging. #404 currently reports conflicts with its immediate base; the integrated audit branch includes both histories, but the original remote PR is not yet repaired.
- Vercel API and CLI both denied access to the `designproject` team. Production environment, storage and deployment state have not been verified or modified.
- Identify/provision the supervised, long-running FFmpeg worker and private storage. Keep `CRRT_RECORD_ENABLED` off until private upload, playback, cleanup and worker smoke tests pass.
- Run the full local Supabase/R2 integration and real Chrome capture, permission, navigation and recovery acceptance flows. Docker is unavailable on this machine; SQL and mocked tests are not substitutes for those flows.
- Keep hosted transcription off until provider policy and consent are approved. Confirm retention and actual Record allowances.
- After merge, publish the widget's exact release commit by tag and verify npm. Build/install or publish the Chrome extension separately; merging the web repository does not update installed extensions.
