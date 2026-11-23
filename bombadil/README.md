# Bombadil UI exploration

[Bombadil](https://github.com/antithesishq/bombadil) drives a real Chrome like a
fast, random, impatient user and checks rules ("properties") after every step.
When a rule breaks, it saves a trace with a screenshot of every step that you
can replay and inspect.

Everything here runs against the **visual-test harness** (`tests/visual/harness`)
served from a production build, with an **in-memory mock API** (`mock-api.ts`).
Nothing touches real data.

## Run it

```bash
cd bombadil && bun install          # once; the repo root also needs `bun install`
./ci.sh 2m                          # every suite, 2 minutes each (nightly uses 10m)
```

Single suites (start a server first, see `ci.sh` for the exact commands):

```bash
PORT=4390 bunx vite preview --config bombadil/harness.vite.config.ts   # from repo root, after a build
ORIGIN=http://127.0.0.1:4390 EXTRA='&public=1' ./run-widget.sh idle 5m
ORIGIN=http://127.0.0.1:4390 ./run-dashboard.sh 1 5m
```

Inspect a trace: `./node_modules/.bin/bombadil browser inspect out/<trace>.bin`.
Replay it: use the `--reproduce` command Bombadil prints at the end of a run.

## Suites (`ci.sh`)

| Suite | Page | API |
|---|---|---|
| `widget-idle` | `/widget` with an in-memory comments adapter | none |
| `widget-send-error` | same, adapter rejects sends | none |
| `widget-public` | `/widget?public=1` (no adapter, talks to `/api`) | healthy mock |
| `widget-public-failing-api` | same | mock fails 30% of writes |
| `dashboard-populated` | `/dashboard/?mock=1` | dashboard mocks + mock API |
| `dashboard-empty` | `/dashboard/?mock=empty` | dashboard mocks + mock API |

`MOCK_FAIL_RATE` (0..1) controls injected write failures. The harness build
publishes the mock server's counters (comments, approvals and deletes received)
into a hidden `#__mock_state` element so rules can check that actions actually
reached the server. The counters only go up, so a stale read can delay a verdict
but never hide a write.

## Rules

Widget (`widget.ts`):

- **Built-in:** no uncaught exceptions, no unhandled promise rejections, no
  `console.error`, no 4xx/5xx page loads.
- **hostPageUntouched:** the widget never changes the host page's text.
- **singleWidgetMount / launcherAlwaysPresent:** exactly one widget, and its
  launcher never disappears.
- **atMostOneModal:** never two modal dialogs at once.
- **focusMovesIntoNewModal:** when a modal opens, focus moves into it within 2s.
- **modalNeverDropsFocus:** while a modal is open, focus never falls to `<body>`
  unless the user clicked blank space (mouse-only browser behaviour).
- **pinNumbersUnique:** no two pins show the same number.
- **sendNeverSilent:** within 3s of Send, the widget shows "Saved", an error
  with the draft kept, or the name prompt.
- **deleteReachesServer:** after Delete, the server receives the delete or an
  error is shown (public mode only).
- **approveReachesServer:** after Approve, the server receives the approval or
  an error is shown (public mode only).
- **noDuplicateAlerts:** the same error message is never shown twice at once.

Dashboard (`dashboard.ts`):

- **Built-in** rules as above; console errors and alerts caused by endpoints
  the mock doesn't implement ("Not mocked") are ignored.
- **neverStuckBlank:** a blank screen never lasts more than 5s.
- **loadingAlwaysFinishes:** loading indicators clear within 10s.
- **atMostOneAlert:** error alerts never pile up.
- **staysInDashboard:** exploration stays under `/dashboard`.
- **tabCountMatchesRows:** the selected status tab's count equals the rows listed.
- **headingMatchesAllTab:** the "Feedback N" heading equals the All tab count.

Leaks are checked separately by `leak-probe.mjs`, which forces garbage
collection (Bombadil can't, so raw DOM/listener counts give false alarms).

## Findings so far

All fixed in #486 (widget 0.3.27) and confirmed with these suites plus control
runs against the old code:

- A rejected Send failed silently (`sendNeverSilent`).
- A rejected Approve or Delete looked successful until reload (`approveReachesServer`, `deleteReachesServer`).
- Edit in public mode never saved (found while building the mock; Edit is now hidden there).
- "Log in to CRRT" dropped keyboard focus out of the name dialog (`modalNeverDropsFocus`).

## Known gaps

- Endpoints the mocks don't cover are logged in `out/mock-*.log` as
  `not mocked` and listed at the end of `ci.sh`. Today that's only hosted
  documents (`POST /v1/documents`), so document screens are lightly tested.
- Random exploration can miss bugs; it complements unit tests, it doesn't
  replace them.
- Running all six suites in parallel on a slow machine can starve Chrome and
  cause false `neverStuckBlank` failures or extractor timeouts; rerun the suite
  alone before treating those as bugs.
- `edit-repro.mjs`, `send-failure-repro.mjs` and `approve-delete-repro.mjs` are
  scripted repros for the bugs fixed in #486.
  Run them against a preview server started with `MOCK_FAIL_RATE=1`.
