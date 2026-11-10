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
steps do not load that environment file. Never commit the token. Visual approval
is handled by UI Review against the PR's target branch.

## Pull request automation

`.github/workflows/chromatic.yml` runs on PR creation (including drafts), new PR
commits, pushes to `trunk`, and manual dispatch. One `blacksmith-4vcpu-ubuntu-2404` visual job
runs the same capture/replay checks and uploads with the existing repository
`CHROMATIC_PROJECT_TOKEN` secret. The GitHub-hosted baseline took 3m 35s, above
the 90-second threshold. The visual job now uses the same Blacksmith runner as
React CI so its next run can measure the difference. Capture/replay workers and
test coverage are unchanged; the report-only comment job remains GitHub-hosted.

A separate job reads the reports without checking out PR code and updates one
bot comment with the commit, direct target branch, snapshot/error counts, Chromatic links, and
workflow logs. It skips stale PR heads and bases. Fork and Dependabot PRs run local checks
without the upload secret or comment-writing permission.

The upload step uses `--exit-zero-on-changes`: Actions finishes successfully when
only visual approval is outstanding. Build errors, rendering failures, failed
local comparisons, and incomplete reports still fail. The native **UI Review**
check is the visual approval gate. It compares snapshots from the PR head with
snapshots at the merge base of its actual GitHub target branch. In a stack,
each PR must target the branch directly below it, so inherited changes are not
repeated in every layer. The base snapshots do not need baseline approval.

All branches build independently. No runner polls, sleeps, or waits for a base
build or a reviewer, and there are no automatic baseline approvals. Both sides
must have a Chromatic build before UI Review can compare them; a missing base
build must be published rather than replaced with a `trunk` comparison. For a
missing historical merge-base build, follow Chromatic's patch-build instructions.
Keep stacked branches rebased when their parents move.

**UI Tests is disabled completely** in the Chromatic project's Manage → Automate
settings (**Visual tests: Disabled**, **UI Review: Enabled**). This is a persistent
project setting shared by every branch, including future PRs and `trunk` builds;
it is not a per-branch CLI flag. Future builds do not publish a separate
**UI Tests** check or require approved baselines. Existing statuses on older
commits may remain visible; they are not required checks.

Snapshot captures are still necessary for UI Review and remain validated by
**Visual screens** and **PR result**. The workflow comment reports upload
completeness; use the native **UI Review** check for the current PR changeset
and approval state. Do not re-enable Visual tests when configuring this project.

CI also uses `--force-rebuild` so rerunning a commit that already passed locally
still emits a fresh JUnit report and native status. Chromatic's default shortcut
for passed same-commit rebuilds exits before writing the report that the comment
job requires. New commits already build normally; UI Review owns visual approval.

The existing project is linked to `thedesignproject/CRRT` using its existing valid
GitHub access, with UI Review enabled and visual tests disabled. Native PR comments remain disabled;
the workflow supplies one comment. That comment records the workflow result;
Chromatic updates its native check after approval without rerunning Actions.
Reports and failure diagnostics are retained for seven days.

### Activate UI Review before switching the required gate

Enable UI Review in the Chromatic project's Manage screen and complete its
GitHub App integration. Verify a real PR receives the native **UI Review**
status, including one targeting another PR branch. Then replace only the exact
**UI Tests** requirement with **UI Review** on `trunk` and protected stack bases.
Preserve the other required checks, their app bindings, and all other branch
protection settings. Keep **Visual screens** and **PR result** required so
capture/upload/report failures cannot be bypassed by an older native result.
The desired contexts are recorded in `scripts/branch-protection.json`; do not
apply the legacy bootstrap script, which targets `main` and replaces the rule.

Until Chromatic emits **UI Review**, leave the live **UI Tests** requirement in
place. Requiring a status that is not enabled would leave PRs pending indefinitely.

On November 10, 2026, the GitHub App integration was installed and the Reviews
page confirmed it was synced with GitHub. The live required context was switched
from **UI Tests** to **UI Review** on `trunk` and `test/chromatic-screens`, preserving
the other requirements and their app bindings. Visual tests were subsequently
disabled in the project to stop the redundant baseline-approval workflow.
PR #417's UI Review passed with 69 snapshots and no changes against `trunk`.
Existing reviews without builds show **Awaiting activity**; the next PR build
must supply their snapshots. A new stacked PR comparison has not yet been
verified against the installed integration.

Fork and Dependabot uploads are deliberately skipped, so their native check
will remain pending until an authorized maintainer runs the head on a
same-repository branch. Do not bypass visual approval with an automatic
skipped/passed status.

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
