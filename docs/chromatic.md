# Screen visual tests

This is a local, screen-level Chromatic setup. It uses real CRRT views with fixed
fixture data; there is no component Storybook to maintain. The Playwright adapter
turns the captured screens into a temporary Storybook archive for Chromatic.

## Run locally

```sh
bun install
bunx playwright install chromium
bun run test:visual
bun run test:visual:types
```

`test:visual` builds the production harness, captures the selected states, builds
the archive, and compares every archive replay with its source PNG. It clears only
`artifacts/chromatic-simple/`. Screenshots, reports, and the static archive stay in
that ignored directory. Retries are disabled and a failed capture/replay fails the
command. Source PNGs are fidelity checks, not approved change baselines. Nonempty
adapter resource-error reports stop the archive build and upload.

## Scope

The explicit selection is in `tests/visual/inventory.ts`: 66 primary captures plus
three mobile checks, for 69 total.

| Surface | Captures | Examples |
| --- | ---: | --- |
| Public site | 16 | Homepage, docs, install, resources, article template, three tools, public audit states; mobile homepage |
| Dashboard | 23 | Feedback, details, settings, onboarding, inbox, billing, auth, MCP connections/consent, audit states; mobile feedback |
| Widget | 15 | Menu, selection, composer, sending/error/success, identity, sidebar, edit, tracker picker; mobile sidebar |
| Widget Agent | 4 | Ready, handoff, upgrade, service error |
| Extension popup | 8 | Disclosure, sign-in, project selection, restricted page, local feedback, import error |
| Storybook addon | 3 | Connected, sign-in required, offline |

There is one primary theme/viewport per surface. Add another only when it exercises
a distinct layout. Articles share one template baseline instead of repeating the
same screen for every content slug. The homepage captures its first viewport,
not dozens of overlapping scroll positions. Marketing videos use their shipped
poster images; playback is outside visual coverage.

The extension cases render the real popup source with browser API fixtures. They
do not test installing an extension or Chrome's background/permission lifecycle.
Normal unit and integration tests remain responsible for behavior beyond this
selected visual inventory. Adding a visual case is an explicit inventory change.

## Manual upload

```sh
bun run chromatic:local
```

This first repeats all local checks, then uses `CHROMATIC_PROJECT_TOKEN` from the
ignored `.env.docker.local` to upload to the existing CRRT project. Capture/build
steps do not load that environment file. Never commit the token. Chromatic's
baseline approval remains manual; visual differences do not automatically pass.

## Pull request automation

`.github/workflows/chromatic.yml` runs on PR creation (including drafts), new PR
commits, pushes to `trunk`, and manual dispatch. One `ubuntu-latest` visual job
runs the same capture/replay checks and uploads with the existing repository
`CHROMATIC_PROJECT_TOKEN` secret. Start with standard GitHub-hosted runners; only
consider Blacksmith if the measured visual job takes more than 90 seconds.

A separate job reads the reports without checking out PR code and updates one
bot comment with the commit, snapshot/error/review counts, Chromatic link, and
workflow logs. It skips stale PR heads. Fork and Dependabot PRs run local checks
without the upload secret or comment-writing permission.

The upload step uses `--exit-zero-on-changes`: Actions finishes successfully when
only visual approval is outstanding. Build errors, rendering failures, failed
local comparisons, and incomplete reports still fail. The separate native
Chromatic **UI Tests** check stays yellow/pending until the changes are accepted;
it passes automatically when there are no changes. Baselines never auto-accept.
No runner polls or waits for a reviewer. Local uploads retain their nonzero exit
code for unapproved differences.

The existing project is linked to `thedesignproject/CRRT` using its existing valid
GitHub access, with visual tests enabled. Native PR comments remain disabled;
the workflow supplies one comment. That comment records the workflow result;
Chromatic updates its native check after approval without rerunning Actions.
Reports and failure diagnostics are retained for seven days.

### Activate the required approval gate when publishing

The yellow check blocks merging only when required by GitHub branch protection.
Enable the exact native **UI Tests** context after the first published workflow
has reported it on the PR head. Preserve existing required checks and protection
settings; do not replace the live rule with the legacy bootstrap script (which
targets `main`, while this repository uses `trunk`). Require the Actions
**Visual screens** and **PR result** checks too, so capture/upload/report failures
cannot be bypassed by an older successful native result.
These three contexts are recorded in `scripts/branch-protection.json`; apply only
the additional check requirements to the live rule, preserving its other values.

Do not activate these requirements on `trunk` before the workflow is available
there: open parent CI PRs (#408/#409/#411) cannot emit the new checks and would
wait indefinitely. For the first stacked PR, protect its immediate base with
the new checks; carry them to `trunk` when the workflow lands there. Fork and
Dependabot uploads are deliberately skipped, so their native check will remain
pending until an authorized maintainer runs the head on a same-repository branch.
Do not bypass visual approval with an automatic skipped/passed status.

Live Actions execution and comment delivery still require publishing the branch
and opening its PR. These local changes do not push code or alter branch rules.

Before publishing, recheck the CI stack (#408 → #409 → #411). While it remains
open, base the Chromatic PR on `ci/blacksmith-prebuilt-deploy` (#411); after it
merges, use the updated `trunk`. Preserve its Vercel build hook and runner setup.
The local branch is aligned with #411, and all 69 captures/replays pass on that
base. Build 9 below verifies the archive on this base with the GitHub integration.

## Verified cloud run

[Build 8](https://www.chromatic.com/build?appId=6aeae810ce4e3a1237160876&number=8)
on `test/chromatic-screens` captured all 69 snapshots with zero rendering errors
and zero skipped tests. Uploading 12 changed files (780.21 kB) took 11 seconds;
299 unchanged files were reused. Cloud capture took 44 seconds.
All 69 initial baselines were subsequently accepted manually in Chromatic.
During the initial run, the CLI's exit code 1 and JUnit `PENDING` failures
represented that review requirement, not rendering failures.

[Build 9](https://www.chromatic.com/build?appId=6aeae810ce4e3a1237160876&number=9)
passed all 69 tests with no visual changes and CLI exit code 0 using the CI
`--exit-zero-on-changes` flag. Upload took 55 seconds; cloud capture took 42
seconds. GitHub received `UI Tests: success` and `Test suite publish: success`
on the tested commit, confirming the linked project's native status delivery.

Local replay comparisons wait for stable consecutive frames. The renderer also
waits for layout/fonts after finishing entrance animations, preventing a cold
font-load frame from being used as the final checkpoint.
