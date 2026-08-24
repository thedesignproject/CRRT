# CRRT Product Audit Foundation — Implementation Plan

**Design spec:** `docs/superpowers/specs/2026-08-24-crrt-product-audit-design.md`  
**Scope:** Audit foundation plus the first authenticated, URL-only tracer slice  
**Target branch:** `feat/product-audit-foundation` from current `origin/trunk`

## Outcome

Deliver one complete internal Product Audit run against public and fixture URLs:

1. an authenticated project member starts an audit;
2. the target passes a strict URL safety gate;
3. a durable workflow explores it in an isolated browser;
4. evidence is persisted before any judgment occurs;
5. deterministic scanners and separate Critic and Verifier stages produce zero to five findings;
6. the dashboard shows ordered progress, coverage, evidence, and the verified result;
7. interruption and retry do not duplicate events, evidence, or findings.

This slice excludes the anonymous landing entry, pause/redirect controls, CRRT publication, repo context, `template-ds` context, and the exhaustive report. It establishes the contracts those slices will consume.

## Technical direction

- **Durability:** Vercel Workflow SDK (`workflow`; verified current version 4.8.4 on 2026-08-24).
- **Browser isolation:** Vercel Sandbox (`@vercel/sandbox`; 3.1.0) running `agent-browser` (0.34.0).
- **Structured model calls:** Vercel AI SDK (`ai`; 7.0.77) through AI Gateway (`@ai-sdk/gateway`; 4.0.62).
- **Validation:** Zod schemas at every workflow boundary.
- **Persistence:** existing Supabase service-role runtime access; Drizzle schema and generated migrations only.
- **Frontend:** existing React/Vite dashboard and base-aware `/dashboard/` routing.
- **Tests:** Vitest, local Supabase integration tests where persistence semantics matter, and deterministic audit fixtures.

All external systems sit behind narrow adapters. Unit and contract tests use deterministic fakes; only dedicated integration tests require Sandbox, Workflow, Gateway, or Supabase credentials.

## Working-tree prerequisite

The current `crrt` worktree contains unrelated staged and unstaged user changes and its local `trunk` is behind `origin/trunk`. Do not implement this plan there.

1. Fetch `origin/trunk`.
2. Create a sibling clean worktree and branch `feat/product-audit-foundation` from `origin/trunk`.
3. Cherry-pick design commit `dfb5b91` so the approved spec travels with the branch.
4. Read `AGENTS.md`, `rules/engineering.md`, `rules/security.md`, `rules/business.md`, `db/DRIZZLE-GUIDE.md`, and the UX/design-system rules before touching their respective surfaces.
5. Run the existing typecheck, test suite, landing build, and dashboard build. Record any pre-existing failure before editing.

Do not pull, reset, clean, or restage the original worktree.

## Task 1 — Add audit domain contracts

**Files**

- Add `api/_lib/audits/contracts.ts`.
- Add `api/_lib/audits/contracts.test.ts`.
- Update `package.json` and `bun.lock` for runtime schema validation and the selected provider SDKs.

**Implement**

Define Zod-backed contracts and inferred TypeScript types for:

- `AuditStatus`: `queued | exploring | evaluating | verifying | completed | partial | failed | cancelled`;
- `AuditSourceCoverage`: URL required; repo and Brain represented as `available | unavailable | not_evaluated`;
- `AuditEvent` with actor, sequence, payload, timestamp, and the closed event set `audit.queued | audit.stage.started | audit.evidence.captured | audit.stage.completed | audit.coverage.partial | audit.finding.verified | audit.completed | audit.failed`;
- `AuditEvidence` with kind, route, element, observation, artifact reference, hash, and capture metadata;
- `RuleReference` with ID, version, provenance, scope, and approval state;
- `AuditCandidate` with evidence and rule references, impact hypothesis, counterevidence, and source coverage;
- `AuditFinding` with every field required by the approved finding contract;
- explicit budgets for navigation actions, wall time, model tokens, artifacts, and routes.

Keep JSON boundary fields serializable. Reject unknown rule states and findings that lack evidence, reproduction, provenance, scope, confidence explanation, or recommended action.

**Tests**

- Parse the smallest valid object for every contract.
- Reject missing evidence, invalid confidence, draft rules, invalid statuses, unknown event types, and non-serializable/oversized payload shapes.
- Verify the TypeScript build consumes inferred types without parallel handwritten interfaces.

**Verify**

```bash
bunx vitest run api/_lib/audits/contracts.test.ts
bun run typecheck
```

**Commit:** `feat(audit): add evidence and finding contracts`

## Task 2 — Build the URL and redirect safety gate

**Files**

- Add `api/_lib/audits/url-safety.ts`.
- Add `api/_lib/audits/url-safety.test.ts`.

**Implement**

Create a pure validation layer plus an injectable DNS resolver. It must:

- accept only `http:` and `https:`;
- reject credentials in URLs;
- normalize hostname, default port, fragment, and path;
- restrict the first release to public destinations on ports 80 and 443;
- resolve every hostname before navigation;
- reject loopback, private, carrier-grade NAT, link-local, multicast, reserved, documentation, and cloud-metadata ranges for IPv4 and IPv6;
- re-run validation for every redirect and compare the resolved address used by the browser;
- cap redirects and reject protocol downgrades when policy requires HTTPS;
- return a structured decision without performing navigation.

The browser adapter must consume a validated target object rather than a raw URL.

**Tests**

- Cover public IPv4/IPv6, localhost aliases, integer/hex IPv4 forms, IPv4-mapped IPv6, userinfo, encoded host tricks, DNS rebinding, redirects to private ranges, unsupported ports, malformed URLs, and redirect loops.
- Assert failures do not expose resolved internal addresses in client-facing messages.

**Verify**

```bash
bunx vitest run api/_lib/audits/url-safety.test.ts
```

**Commit:** `feat(audit): enforce safe public targets`

## Task 3 — Add additive audit persistence

**Files**

- Update `db/schema.ts`.
- Generate the next `db/migrations/` SQL, snapshot, and journal entry.
- Add `api/_lib/audits/store.ts`.
- Add `api/_lib/audits/store.test.ts`.
- Add `api/_lib/audits/store.integration.test.ts`.

**Schema**

Add deny-all-RLS tables:

- `audit_runs`: run identity, nullable project key, creator user ID, start idempotency key, target URL, status, current phase, stage lease, budgets, coverage, source snapshot, failure summary, timestamps, and expiry; enforce unique `(creator_user_id, start_idempotency_key)`;
- `audit_events`: identity sequence, audit ID, event type, actor type/ID, idempotency key, payload, timestamp, and unique `(audit_id, idempotency_key)`;
- `audit_evidence`: audit ID, stable evidence key, kind, route, element, observation, artifact metadata/hash, capture metadata, and unique `(audit_id, evidence_key)`;
- `audit_candidates`: audit ID, stable candidate key, structured candidate payload, decision state, and unique `(audit_id, candidate_key)`;
- `audit_findings`: audit ID, stable finding key, rank, structured verified payload, publication state, and unique `(audit_id, finding_key)`.

Use indexes for `(project_key, created_at)`, `(audit_id, event sequence)`, and `(audit_id, rank)`. Keep the migration additive and backwards-compatible. Enable deny-all RLS in generated SQL if Drizzle does not emit it automatically. Read the generated SQL before committing.

**Store boundary**

Keep audit persistence out of the already broad `api/_lib/store.ts`. The new store uses `getServiceSupabase`, maps snake_case rows once, and exposes scoped operations:

- create/get/update run;
- append/list events after a cursor;
- put/list evidence idempotently;
- put/list candidates idempotently;
- finalize verification through a `finalize_audit_verification` database RPC that locks the run, validates the stage lease, upserts the stable finding set, appends terminal events, and advances the run atomically;
- acquire a stage lease and complete it atomically.

Add migration-backed Postgres functions for stage lease acquisition and `finalize_audit_verification`, because those read-then-write sequences would otherwise race. Keep their contracts covered by integration tests and modify only the newly generated, unapplied migration.

**Tests**

- Unit-test row mapping and Supabase error propagation.
- Integration-test uniqueness, event ordering, lease contention, idempotent retries, cascading cleanup, deny-all RLS, and completed-run immutability.

**Verify**

```bash
bun run db:generate
bunx drizzle-kit check
bunx vitest run api/_lib/audits/store.test.ts
bunx vitest run api/_lib/audits/store.integration.test.ts
```

**Commit:** `feat(audit): persist runs evidence and verified findings`

## Task 4 — Expose authenticated start, read, and event APIs

**Files**

- Add `api/v1/audits/index.ts` and `api/v1/audits/index.test.ts`.
- Add `api/v1/audits/capabilities.ts` and `api/v1/audits/capabilities.test.ts`.
- Add `api/v1/audits/[auditId]/index.ts` and sibling test.
- Add `api/v1/audits/[auditId]/events.ts` and sibling test.
- Add `api/_lib/audits/access.ts` and sibling test.
- Extend `api/_lib/http.ts` only if a shared streaming/cursor helper is required.

**Implement**

- `POST /api/v1/audits` accepts `{ projectKey, url }`, requires the server feature flag, `requireUser`, project membership, and an `Idempotency-Key` header, applies URL safety, creates the run, emits `audit.queued`, and starts the durable workflow exactly once.
- `GET /api/v1/audits/capabilities` requires authentication and returns `{ enabled: boolean }`; it never exposes provider configuration.
- `GET /api/v1/audits/:auditId` returns a project-scoped projection with status, coverage, budgets, verified findings, and failure/partial reason.
- `GET /api/v1/audits/:auditId/events?after=<sequence>&limit=<n>` follows the existing cursor-event pattern and returns ordered events plus `nextCursor`. The dashboard may poll this endpoint in the tracer slice; a later slice can add an SSE transport without changing event semantics.
- The access helper always authenticates before loading project-scoped data and fails closed on store errors.

Return stable public error codes alongside human-readable messages. Do not return model prompts, raw internal IP decisions, private artifact paths, or provider errors.

**Tests**

- OPTIONS and method guards.
- Missing/invalid input.
- Unauthenticated and non-member access.
- Unsafe targets rejected before run creation.
- Duplicate start idempotency.
- Disabled feature behavior for capability and mutation endpoints.
- Cursor limits and event ordering.
- Cross-project audit access denied.
- Store/workflow failure maps to safe 5xx responses.

**Verify**

```bash
bunx vitest run api/v1/audits
bun run typecheck
```

**Commit:** `feat(audit): add authenticated run APIs`

## Task 5 — Create deterministic audit fixtures

**Files**

- Add `test/fixtures/audit-products/clean/`.
- Add `test/fixtures/audit-products/broken-checkout/`.
- Add `test/fixtures/audit-products/known-issues.ts`.
- Add `scripts/audit-fixture-server.ts`.
- Add fixture-server tests.

**Implement**

Create two small, deterministic multi-route products:

- `clean`: labeled controls, functional navigation, recoverable errors, no seeded high-confidence violations;
- `broken-checkout`: dead primary action, unlabeled required input, trapped error recovery, and a controlled console/network failure.

Each seeded issue has a machine-readable expected evidence class and rule ID. Do not assert exact model wording. The fixture server binds loopback for local tests only; production URL validation remains strict. Integration tests inject an explicit test-only target policy rather than weakening production validation.

**Tests**

- Server starts/stops without leaking ports.
- Routes and seeded behaviors are deterministic.
- Clean fixture manifest contains no expected top findings.

**Verify**

```bash
bunx vitest run scripts/audit-fixture-server.test.ts test/fixtures/audit-products
```

**Commit:** `test(audit): add clean and known-issue products`

## Task 6 — Implement evidence-only Explorer adapters

**Files**

- Add `api/_lib/audits/explorer/types.ts`.
- Add `api/_lib/audits/explorer/fixture.ts` and sibling test.
- Add `api/_lib/audits/explorer/sandbox.ts` and sibling contract test.
- Add `api/_lib/audits/explorer/plan.ts` and sibling test.

**Implement**

Define an `AuditExplorer` interface that receives a validated target, explicit budgets, an event sink, and an evidence sink. It returns coverage only; it cannot return findings.

The deterministic fixture adapter drives fixture routes directly for fast tests. The production adapter:

- creates an isolated Vercel Sandbox with no CRRT production credentials;
- installs/runs the pinned `agent-browser` CLI and Chrome inside the sandbox;
- navigates only validated destinations;
- captures screenshots, DOM excerpts, accessibility snapshots, console messages, network failures, and action outcomes;
- uploads large artifacts through a narrow evidence-storage credential or returns them to a trusted ingest boundary;
- emits sanitized progress events;
- enforces route, action, redirect, wall-clock, and artifact budgets;
- refuses denylisted consequential actions.

The navigation planner can choose among links and safe controls, but every action passes a deterministic policy before execution. The first slice explores at most five same-origin routes and twenty safe actions.

**Tests**

- Both adapters pass the same contract suite.
- Explorer output cannot satisfy the Finding schema.
- Budget exhaustion returns partial coverage.
- Redirects are revalidated.
- Denylisted actions are skipped and recorded.
- Artifact metadata is stable and idempotent.
- Sandbox errors are sanitized and resumable.

**Verify**

```bash
bunx vitest run api/_lib/audits/explorer
```

**Commit:** `feat(audit): collect browser evidence in isolation`

## Task 7 — Add the default Brain and deterministic scanners

**Files**

- Add `api/_lib/audits/rules/default-brain.ts`.
- Add `api/_lib/audits/rules/query.ts`.
- Add `api/_lib/audits/rules/rules.test.ts`.
- Add `api/_lib/audits/scanners/` with focused scanner modules and tests.

**Implement**

The default Brain is a versioned, immutable registry. The tracer slice contains only narrow, defensible hard rules required by the fixtures, each with stable ID, source, version, applicability, evidence requirements, and approval state. Do not add broad taste heuristics merely to increase output.

Implement deterministic scanners for:

- action outcome and dead-end detection;
- required accessible naming;
- recorded console/network failures tied to a user action;
- error-recovery availability.

Scanners produce typed signals, not findings. `brain.query` returns only approved, applicable rules and records the Brain version/hash used by the run.

**Tests**

- Draft/deprecated/experimental rules are never returned.
- Exact hard violations map to stable rule IDs.
- Clean fixture produces no hard-violation signals.
- Rule order and Brain hash are deterministic.

**Verify**

```bash
bunx vitest run api/_lib/audits/rules api/_lib/audits/scanners
```

**Commit:** `feat(audit): add versioned rules and deterministic scanners`

## Task 8 — Separate Critic and Verifier model stages

**Files**

- Add `api/_lib/audits/model/types.ts`.
- Add `api/_lib/audits/model/gateway.ts` and sibling contract test.
- Add `api/_lib/audits/critic.ts` and sibling test.
- Add `api/_lib/audits/verifier.ts` and sibling test.
- Add prompt fixtures under `api/_lib/audits/prompts/`.

**Implement**

Create an `AuditModel` interface that accepts a named stage, versioned instructions, structured input, output schema, and budget. The AI SDK/Gateway adapter must request schema-constrained output and record model, provider, prompt version, token use, and latency without storing secrets or hidden reasoning.

The Critic receives evidence, deterministic signals, relevant approved rules, and source coverage. It creates candidates but cannot set final rank or publication state.

The Verifier receives candidates plus the complete cited evidence and rules. It must:

- reject nonexistent evidence/rule references;
- reject Design System or repo claims in a URL-only run;
- challenge causal and impact claims;
- merge duplicate symptoms;
- enforce one-hard-rule or two-independent-signal admission;
- return zero to five schema-valid findings.

Use independent prompts and fresh context for Critic and Verifier. Tests use a deterministic fake model that can emit valid, invalid, contradictory, and padded outputs.

**Tests**

- Unsupported and cross-source claims are rejected.
- A single weak heuristic cannot become a finding.
- A hard rule with direct evidence can pass.
- Two independent signals can pass when counterevidence is absent.
- Duplicate candidates collapse deterministically.
- Clean fixture returns zero even when the fake Critic pads candidates.
- Model timeout/token exhaustion yields partial or failed state without fabricated output.

**Verify**

```bash
bunx vitest run api/_lib/audits/critic.test.ts api/_lib/audits/verifier.test.ts api/_lib/audits/model
```

**Commit:** `feat(audit): verify structured product findings`

## Task 9 — Orchestrate the durable workflow

**Files**

- Add `api/_lib/audits/workflow.ts`.
- Add `api/_lib/audits/workflow.test.ts`.
- Add small stage modules under `api/_lib/audits/stages/` when a stage exceeds one responsibility.
- Wire workflow start through the Task 4 API.

**Implement**

Define the Workflow SDK entrypoint and durable steps:

1. load and validate the immutable run/source snapshot;
2. acquire the Explorer lease;
3. collect and persist evidence;
4. run and persist deterministic signals;
5. run and persist Critic candidates;
6. run Verifier and atomically persist the final finding set;
7. emit completion or partial-coverage event.

Every step has a stable idempotency key and persists output before advancing. Provider retries remain bounded. Resuming after failure reuses existing evidence/candidates and never repeats a completed side effect. Cancellation and intervention are not exposed in this slice, but the workflow reads run state between stages so later controls do not require a redesign.

Provide an in-process test runner using the same stage functions and fake adapters. Do not mock away the persistence/idempotency boundary in workflow tests.

**Tests**

- Happy path produces ordered events and verified findings.
- Clean fixture completes with zero findings.
- Explorer, Critic, and Verifier failures resume at the correct stage.
- Concurrent starts yield one workflow execution.
- Replayed steps do not duplicate evidence, candidates, events, or findings.
- Budget exhaustion completes partial with explicit coverage.

**Verify**

```bash
bunx vitest run api/_lib/audits/workflow.test.ts
bun run typecheck
```

**Commit:** `feat(audit): orchestrate resumable audit runs`

## Task 10 — Add the internal read-only audit workspace

**Files**

- Add `apps/dashboard/components/ProductAuditWorkspace.tsx` and tests.
- Add `apps/dashboard/components/ProductAuditLauncher.tsx` and tests.
- Add `apps/dashboard/components/AuditProgress.tsx` and tests.
- Add `apps/dashboard/components/AuditFinding.tsx` and tests.
- Extend `apps/dashboard/api.ts` and its tests.
- Extend `apps/dashboard/lib/types.ts` from shared wire types without duplicating domain contracts.
- Extend `apps/dashboard/lib/routes.ts` and route tests.
- Update `apps/dashboard/App.tsx` and focused routing tests.

**Implement**

Add a base-aware authenticated route `/dashboard/audits/:auditId`. The workspace displays:

- run status and evaluated/not-evaluated coverage;
- current stage and cursor-polled event timeline;
- budget/partial-coverage state;
- zero-state copy when no finding qualifies;
- zero to five finding summaries;
- cited evidence previews and rule provenance;
- explicit internal-only badge while the feature flag is active.

Add an internal project-scoped launcher with a URL field and `Run product audit` action. It generates one idempotency key per user submission, calls the start API once, and navigates to the returned base-aware audit route. It is visible only when `AUDIT_FEATURE_ENABLED` is exposed through the authenticated server capability response; do not ship a client-only environment flag that can bypass server enforcement.

The workspace is read-only in this slice. Do not add pause, redirect, sharing, claiming, deep-report, or Ready controls. Poll only while the run is active, back off on repeated errors, and stop on terminal state. Every control and evidence preview must be keyboard accessible and use existing CRRT components/tokens.

**Tests**

- Loading, active, partial, failed, zero-result, and findings states.
- Launcher validation, double-submit prevention, API failure recovery, and successful navigation.
- Polling stops on terminal status and cleans up on unmount.
- Evidence and rule provenance render from real wire shapes.
- Base-aware navigation works under `/dashboard/`.
- No review-state mutation is available.

**Verify**

```bash
bunx vitest run apps/dashboard
bun run build:dashboard
```

**Commit:** `feat(audit): show live verified audit results`

## Task 11 — Add the release evaluation gate

**Files**

- Add `evals/product-audit/cases.ts`.
- Add `evals/product-audit/run.ts`.
- Add `evals/product-audit/report.ts`.
- Add `evals/product-audit/run.test.ts`.
- Add a package script `eval:audit`.

**Implement**

Create a versioned evaluation runner that executes clean and known-issue fixtures through the real contracts and test adapters. It reports:

- evidence coverage;
- unsupported-reference count;
- expected hard-rule recall;
- top-finding precision against reviewed fixture expectations;
- padded-finding count;
- duplicate count;
- run duration and stage budgets.

The command exits nonzero when any release gate fails. Initial hard gates are 100% valid evidence/provenance, zero unsupported high-confidence findings, zero padded clean-fixture findings, and no duplicate side effects after replay. Human-value precision on real products remains a tracked launch gate once the golden set exists; fixture labels do not pretend to measure taste.

**Verify**

```bash
bun run eval:audit
```

**Commit:** `test(audit): gate unsupported and padded findings`

## Task 12 — Full verification and handoff

Run from the clean implementation worktree:

```bash
bun install --frozen-lockfile
bun run typecheck
bun run test
bun run build
bun run build:dashboard
bun run eval:audit
bunx drizzle-kit check
git diff --check origin/trunk...HEAD
```

Then:

1. Reset a local Supabase instance and apply every migration from baseline.
2. Run persistence integration tests against the local instance.
3. Run one Sandbox/Gateway integration audit against the known-issue fixture in an approved non-production environment.
4. Confirm secrets, raw provider errors, internal addresses, and hidden reasoning do not appear in events or API responses.
5. Confirm the original dirty worktree is unchanged.
6. Invoke the repo-local `$diff-coverage` skill and reach 100% line and branch diff coverage versus `trunk`.
7. Document provider credentials, budgets, feature flag, rollback, and known limitations in the PR.

## Environment contract

Add server-only variables with no `VITE_` prefix:

- production Gateway and Sandbox access through Vercel OIDC; `AI_GATEWAY_API_KEY` is accepted only for local integration runs;
- `AUDIT_MODEL`;
- `AUDIT_FEATURE_ENABLED`;
- per-run budget and timeout configuration;
- existing Supabase service-role variables.

The API must fail closed with a clear server-misconfigured error when a required provider is unavailable. Unit tests must not require these variables.

## Definition of done

- One authenticated project member can start a URL-only audit from an internal dashboard entry.
- The run survives a process restart and resumes from a persisted checkpoint.
- Browser exploration occurs in an isolated sandbox and cannot reach private network targets.
- Explorer output contains evidence and coverage, never findings.
- Critic and Verifier are separate schema-constrained stages.
- Every displayed finding has valid evidence and approved rule provenance.
- The clean fixture returns zero findings.
- The known-issue fixture returns only supported findings.
- API and dashboard enforce project membership.
- No endpoint or agent tool can mutate review status or code.
- All verification commands pass and diff line/branch coverage is 100%.

## Follow-on plans

After this tracer slice is accepted, create separate plans in this order:

1. anonymous landing entry, quotas, temporary workspace, and claim flow;
2. pause/resume/redirect/context interventions and shared-session permissions;
3. idempotent publication as open CRRTs;
4. read-only GitHub evidence;
5. approved `template-ds` Brain snapshots and `brain.query`;
6. separately budgeted exhaustive report;
7. deployment-triggered continuous audit only after precision and cost gates remain stable.
