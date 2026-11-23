# Bombadil UI exploration

[Bombadil](https://github.com/antithesishq/bombadil) drives a real Chrome like a
fast, random user and checks rules after every step. It runs against a
production build of the visual-test harness with an in-memory mock API
(`mock-api.ts`, `MOCK_FAIL_RATE` rejects a share of writes), so nothing touches
real data. The rules live in `widget.ts` and `dashboard.ts`, each with a comment
saying what it checks and why.

## Run it

```bash
cd bombadil && bun install                     # once; the repo root needs `bun install` too
./ci.sh 2m                                     # all six suites, 2 minutes each
BOMBADIL_SUITES=widget-public ./ci.sh 5m       # selected suites
./node_modules/.bin/bombadil browser inspect out/failed/<suite>.bin   # replay a failure
```

The suites are listed at the top of `ci.sh`. CI (`.github/workflows/bombadil.yml`)
runs 3 of them for 2 minutes on UI pull requests and all 6 for 10 minutes
nightly, one runner each. A failing nightly run opens or updates an issue
labelled `bombadil`, and failing traces are uploaded as artifacts.

## When the app changes

New UI is explored automatically and the general rules (no crashes, no stuck
screens, dialogs keep focus) apply to it. Three things need a person:

- **New behaviour needs a rule**: Bombadil only checks what a rule says.
- **New endpoints need a mock** in `mock-api.ts`; `ci.sh` lists anything unmocked.
- **Renamed markup can switch a rule off silently**: rules find things by
  selectors and text (e.g. the composer's "Leave your comment…" placeholder).

## Other tools

- `edit-repro.mjs`, `send-failure-repro.mjs`, `approve-delete-repro.mjs`: scripted
  repros for the bugs fixed in #486; each exits 1 if its bug comes back.
  `edit-repro.mjs` uses the healthy server (:4390), the others a server started
  with `MOCK_FAIL_RATE=1` (:4392).
- `leak-probe.mjs`: repeats widget interactions with forced garbage collection
  and reports DOM node and listener growth (Bombadil can't force GC).
- Running many suites at once on a slow machine can starve Chrome and cause
  false `neverStuckBlank` or extractor timeouts; rerun the suite alone first.
