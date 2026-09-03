# CRRT Product Audit — Design Specification

**Date:** 2026-08-24  
**Status:** Approved design; ready for implementation planning  
**Product:** CRRT  
**Related system:** `template-ds`

## 1. Summary

CRRT Product Audit lets CRRT find valuable product problems before a person leaves feedback. A visitor supplies a public URL and CRRT explores the product, collects evidence, checks only authorized rules, and returns zero to five high-impact, high-confidence findings. A signed-in team can add a GitHub repository and an approved `template-ds` Brain to improve technical and design-system analysis.

The feature extends CRRT's existing visual-feedback loop; it does not replace it. The landing page continues to explain the widget, let visitors try it, and show the two-step installation. Product Audit becomes a separate chapter immediately after the interactive widget demo.

The core product promise is:

> You can leave the CRRTs. Or CRRT can find them first.

CRRT must prefer an honest empty result over an unsupported finding. The target is three to five findings, not a quota.

## 2. Product intent

CRRT currently turns human visual feedback into actionable work. Product Audit adds a synthetic reviewer that can initiate that loop while preserving human authority. The result is not a generic AI review, bug tracker, code review, or autonomous code generator. It is evidence-backed product feedback that enters the existing CRRT workflow and can ultimately become a shipped fix.

The feature also advances CRRT toward multiplayer agent work:

- people can join the same live audit session;
- they can watch what the agent is doing;
- the session can be paused or redirected;
- people can add context while the audit is running;
- the output remains available for team review and handoff.

The product should optimize for valuable findings that teams accept and ship, not for finding count.

## 3. Goals

- Produce zero to five high-impact, high-confidence findings from a public product URL.
- Work usefully with only a URL and improve progressively when a repo or Design System is available.
- Attach verifiable evidence and provenance to every finding.
- Make the agent's work observable and interruptible by people.
- Convert authenticated results into open CRRTs that the team can accept, reject, discuss, or mark Ready.
- Offer a useful anonymous first audit without requiring signup.
- Preserve the widget demo, explanation, installation journey, and current CRRT positioning.
- Use `template-ds` as a versioned source of approved design rules, not as unconstrained model context.

## 4. Non-goals for the first release

- Authenticated product flows or credential storage.
- Continuous audits triggered by every deployment.
- Automatic code changes, pull requests, merges, or review-state changes.
- Arbitrary document uploads.
- Automatically promoting extracted rules to approved governance.
- Learning new rules from user behavior without review.
- Purchases, destructive actions, message sending, or other consequential browser actions.
- Replacing the existing CRRT widget or the human feedback workflow.
- Returning a fixed number of findings when the evidence does not support them.

## 5. Landing-page integration

The current landing journey remains recognizable:

1. Hero: understand CRRT and choose **Try the demo** or **Install in 2 min**.
2. How it works: install the script, leave a comment, use the agent handoff.
3. Interactive demo: use the real widget on the fake dashboard.
4. **Product Audit:** give CRRT a URL and let it look first.
5. Installation: retain the current two snippets and docs CTA.
6. Pricing and closing content.

The Product Audit section is inserted immediately after `FakeDashboard` and before the installation section. The navigation gains an `Audit` anchor. The hero does not become an audit form and the landing does not transform into the results UI.

The section contains:

- section label `/ 04 product audit`;
- headline `You can leave the CRRTs. Or CRRT can find them.`;
- short explanation of the evidence-backed result;
- required URL field;
- primary CTA `Run product audit`;
- context indicators: `URL required`, `Connect repo`, `Add Design System`;
- a compact example showing the shape of a finding without presenting fabricated live results.

Submitting the form starts an audit, shows lightweight live progress, and then transitions to a dedicated, shareable audit workspace. Findings, evidence, collaboration, and the exhaustive report do not live inside a marketing-page modal.

The section follows the existing CRRT design tokens and landing patterns. It does not introduce a separate visual language, nested-card composition, generic gradients, or dashboard-scale hero typography.

## 6. Access and freemium model

### Anonymous visitor

An anonymous visitor can run one useful URL-only audit without signup.

- The target must be publicly reachable over HTTP or HTTPS.
- The run is rate-limited by signed browser session and IP.
- One browser may have one active anonymous run at a time.
- The audit workspace is unlisted and retained for 24 hours.
- The signed session token can pause or redirect the run; possession of a share URL grants view-only access.
- The run may return zero to five findings.
- Repo access, Design System context, persistence beyond 24 hours, team collaboration, and the exhaustive report require signup.

Initial abuse controls allow one anonymous audit per browser per 24 hours and up to three per public IP per 24 hours. These values are configuration, not marketing promises, and can be tuned without changing the product contract.

### Authenticated project

A signed-in user can claim an anonymous audit or start one inside a CRRT project. Authenticated audits can use the project's connected GitHub repository and approved `template-ds` Brain. Published findings become open CRRTs authored by `CRRT Audit`.

Claiming an audit preserves the audit ID, evidence, events, and findings. It must not rerun the audit or duplicate CRRTs.

## 7. Progressive input and evaluation scope

The audit adapts to the supplied sources.

### URL only

CRRT may evaluate observable behavior and its likely user or business impact, including broken flows, confusing recovery, accessibility barriers, unclear calls to action, and inconsistent behavior visible across pages. It must not assert a code-level cause or a Design System violation.

### URL plus repository

CRRT may additionally identify relevant files and components, suggest a likely technical cause, estimate change scope and implementation risk, and connect observed behavior to code evidence. Repository access is read-only.

### URL plus approved Design System Brain

CRRT may additionally evaluate component, token, content-pattern, and interaction-rule consistency. Every such claim must cite the exact approved rule and Brain snapshot.

### All sources

CRRT ranks candidates by impact, confidence, and feasibility while preserving the provenance of every supporting signal. Missing sources appear as `not evaluated`, never as inferred facts.

## 8. Finding contract

Every published finding contains:

- stable finding ID;
- classification: `finding` or `opportunity`;
- concise title;
- affected route, flow, and element;
- user or business impact statement;
- one or more evidence references;
- the rule references used to evaluate the evidence;
- reproduction steps;
- evaluated and non-evaluated source coverage;
- confidence score and confidence explanation;
- relevant counterevidence or the condition that would disprove the finding;
- recommended next action;
- repo locations when repo evidence exists;
- Design System rule and Brain version when Design System evidence exists.

`Opportunity` is reserved for supported brainstorming ideas that are not defects. Opportunities never masquerade as verified problems and do not enter the top findings unless the evidence and impact gates are satisfied.

The initial summary contains zero to five findings. It must not pad the output. Lower-confidence candidates remain internal and are not displayed as findings. An authenticated user can start a separate exhaustive report, which increases exploration depth but does not lower the evidence threshold or publish unsupported candidates.

## 9. Audit constitution

### Evidence priority

Sources are authoritative in this order:

1. Explicit, approved customer rules and instructions.
2. Approved Design System Brain rules, tokens, components, and decisions.
3. Repository implementation, tests, and configuration.
4. Observable product behavior and captured runtime evidence.
5. Versioned universal standards and named CRRT heuristics.

Higher-priority sources can constrain lower-priority interpretation. A heuristic cannot override an explicit approved product rule.

### Publication gates

A candidate can become a top finding only when it has either:

- one deterministic violation of an applicable hard rule with direct evidence; or
- at least two independent supporting signals and no stronger counterevidence.

Every finding must cite its evidence and rules. If the required source is absent, that dimension is marked `not evaluated`. If the Verifier cannot support enough findings, the audit returns fewer than three or zero.

Automatically extracted rules begin in `draft` state. Draft, deprecated, experimental, placeholder, and conflicting unresolved rules cannot govern an audit.

### Human authority

Published project findings become open CRRTs. The agent cannot mark them Ready, approve them, alter team roles, create code changes, or merge work. Humans retain review-state ownership.

## 10. Agent architecture

The product presents one CRRT audit agent. Internally, it is a durable workflow with bounded stages and three logical agent roles. The roles may use the same model deployment; they are separation-of-responsibility boundaries, not independent services.

### 10.1 Intake and safety gate

- Validate the URL and source permissions.
- Resolve the target safely and reject private, loopback, link-local, metadata-service, file, and non-HTTP destinations.
- Create the audit record, signed anonymous capability when applicable, budgets, and initial event.
- Snapshot all connected context so a running audit is reproducible.

### 10.2 Explorer

The Explorer navigates and records facts. It may navigate, click safe controls, enter synthetic non-sensitive values, inspect DOM and accessibility data, capture screenshots, record console and network failures, and store observed outcomes.

The Explorer cannot emit findings. It cannot submit purchases, deletions, invitations, outbound messages, account changes, or other consequential actions. It remains on the approved origin unless an explicit redirect is both safe and necessary to the observed flow.

### 10.3 Deterministic scanners

Deterministic tools evaluate facts that should not depend on model judgment, such as broken navigation, console errors, accessibility-tree violations, missing labels, response failures, and exact token or component-rule mismatches when source data is available.

### 10.4 Critic

The Critic maps evidence to applicable approved rules and produces structured candidates. It can query relevant Brain rules and repo evidence but cannot introduce uncited rules. It records impact hypotheses, reproduction, counterevidence, and source coverage.

### 10.5 Verifier

The Verifier attempts to disprove candidates, checks rule applicability, rejects unsupported causal claims, deduplicates related symptoms, and calculates confidence. It alone can pass candidates to publication.

### 10.6 Publisher

The Publisher selects zero to five findings, generates the summary, and creates open CRRTs for authenticated projects. Publication is idempotent: retrying the stage cannot duplicate findings or CRRTs.

## 11. Agent tool permissions

Allowed tools are narrowly scoped:

- browser navigation and safe interaction;
- screenshot, DOM, accessibility-tree, console, and network capture;
- read-only repository search and file retrieval;
- `brain.query` against a pinned Brain snapshot;
- evidence storage and retrieval;
- audit event emission;
- open-CRRT creation during the idempotent publication stage.

The agent has no general shell, deployment, database mutation, purchase, messaging, code-writing, pull-request, merge, or review-state tools.

## 12. Multiplayer audit session

Every run is a live, shared session rather than a hidden prompt execution.

The event stream exposes:

- current stage and explored route;
- safe high-level action descriptions;
- evidence-capture events;
- coverage and budget progress;
- pauses, retries, skipped flows, and partial-coverage reasons;
- progressive verified findings.

Authorized participants can:

- pause and resume;
- redirect the Explorer to a route or flow within scope;
- add context or clarify intent;
- watch the same session;
- hand the session to another teammate.

Interventions append immutable events. They do not rewrite prior evidence. A redirect updates the remaining plan and triggers re-verification when it affects a candidate.

Anonymous owners control the session through the signed capability token. Anonymous share links are view-only. Authenticated project permissions govern team actions after an audit is claimed or created inside a project.

## 13. Durable workflow and API boundaries

An audit must not run inside one serverless request. The API starts or controls a durable, checkpointed job.

Proposed boundaries:

- `POST /api/v1/audits` — validate input and create a run.
- `GET /api/v1/audits/:auditId` — retrieve current state, coverage, and verified output.
- `GET /api/v1/audits/:auditId/events` — stream ordered audit events.
- `POST /api/v1/audits/:auditId/actions` — pause, resume, redirect, or add context.
- `POST /api/v1/audits/:auditId/claim` — attach an anonymous run to an authenticated project.
- `POST /api/v1/audits/:auditId/deep-report` — start the authenticated exhaustive run.

The implementation may use the repository's chosen durable workflow or queue provider, but it must preserve these behavioral contracts: checkpointing, ordered events, resumability, bounded retries, idempotent publication, and no duplicate side effects.

Conceptual persisted records are:

- audit run;
- source snapshot;
- ordered event;
- evidence artifact;
- candidate;
- verified finding;
- intervention;
- publication mapping from finding to CRRT.

Evidence and findings use stable IDs. Large screenshots and traces live in object storage; records store metadata, hashes, and access-controlled references.

## 14. `template-ds` integration contract

`template-ds` is the framework and governance source for project-specific design knowledge. It is not universal design truth and does not independently decide whether a product is good.

CRRT consumes a pinned, read-only Brain snapshot. `brain.query` returns only relevant rules with:

- stable rule ID;
- title and rule type;
- approved state;
- scope and applicability conditions;
- rule content;
- provenance;
- Brain version and content hash;
- supersession or deprecation metadata.

Only `approved` rules can govern an audit. Extracted candidates remain `draft` until a person promotes them. The default CRRT Brain contains only versioned, generally defensible standards and explicitly named heuristics. Placeholder examples never become governance.

### Prerequisite `template-ds` work

The existing onboarding vertical slice is a deterministic fixture and does not yet provide production URL ingestion, CRRT extraction, or GitHub promotion. Before connected Design System audits ship, `template-ds` needs:

- a production snapshot export and query contract;
- real read-only repository and artifact ingestion;
- explicit draft-to-approved promotion;
- stable provenance and version hashes;
- a CRRT adapter for attaching a Brain snapshot to a project;
- updated integration documentation that reflects CRRT's writable agent instructions;
- aligned CRRT package/submodule versions;
- automated publication of current Wiki documentation.

URL-only audits do not wait for these prerequisites. Design System assertions remain disabled until the contract is available and an approved snapshot is connected.

## 15. Failure handling

- **Blocked or unreachable site:** return a partial-coverage result with the precise reason; do not synthesize findings.
- **Login required:** stop at the public boundary and mark protected flows not evaluated.
- **Agent stuck:** apply per-action timeout, bounded retry, then skip the flow and record the loss of coverage.
- **Model or provider failure:** resume from the last checkpoint and retry within the run budget; preserve collected evidence.
- **Missing repo or Brain:** continue with the remaining sources and prohibit unsupported dimensions.
- **Conflicting approved rules:** exclude the conflicting rule set, disclose the conflict, and continue only where interpretation remains unambiguous.
- **Interrupted run:** resume from the latest completed stage without repeating consequential side effects.
- **No qualifying candidates:** complete successfully with zero findings and explain that no issue met the confidence threshold.
- **Publication retry:** use stable idempotency keys for every finding-to-CRRT mapping.

Runs have explicit navigation, action, token, wall-clock, and storage budgets. Reaching a budget produces partial coverage rather than an unbounded run.

## 16. Security and privacy

- Protect browser execution against SSRF before navigation and after every redirect, including DNS rebinding checks.
- Block private, local, link-local, cloud metadata, file, and unsupported protocol targets.
- Run browser work in an isolated environment with restricted egress and no CRRT production credentials.
- Use synthetic inputs only; never request user passwords for the first release.
- Redact common secrets and personal data from logs and model context when possible.
- Keep anonymous workspaces unlisted, capability-protected, and automatically deleted after 24 hours unless claimed.
- Scope repo and Brain reads to the authenticated project and record the exact source snapshot used.
- Treat screenshots, DOM captures, traces, and repo excerpts as private project evidence after claim.
- Rate-limit creation, actions, event streams, and deep-report requests independently.
- Keep public audit comments and review-state mutation outside this feature; publishing and moderation require authenticated project permissions.

## 17. First-release scope

The first release includes:

- public URL audit;
- optional read-only GitHub context for authenticated projects;
- optional approved Brain context once the `template-ds` contract exists;
- three to five intended product flows within bounded exploration;
- zero to five verified findings;
- live progress and ordered events;
- pause, resume, redirect, and add-context controls;
- anonymous claim flow;
- open-CRRT publication;
- authenticated exhaustive report.

The next release may add authenticated product sessions and deployment-triggered continuous audit. Automatic code changes remain a separate product decision and are not implied by this design.

## 18. Testing and evaluation

### Contract and unit tests

- Reject publication when evidence, provenance, confidence, scope, or reproduction is missing.
- Enforce that draft, deprecated, experimental, placeholder, or conflicting rules cannot govern findings.
- Enforce source-dependent claim limits.
- Verify idempotent claim and publication behavior.
- Test URL safety, redirect validation, rate limits, capability permissions, and retention cleanup.
- Test checkpoint and resume behavior for every workflow stage.

### Deterministic fixture products

Maintain fixture sites with seeded, known issues across behavior, accessibility, and Design System consistency. Assertions target captured evidence and rule mapping, not exact model wording. Include a clean fixture that must produce zero high-confidence findings.

### Golden evaluation set

Build a versioned set of real product surfaces reviewed by product, design, and engineering humans. Evaluate URL-only, URL-plus-repo, URL-plus-Brain, and full-context runs separately.

Release gates:

- every displayed finding has valid evidence and provenance;
- zero unsupported high-confidence findings in the release set;
- at least 85% of top findings are judged valuable by human reviewers;
- clean fixtures do not receive padded findings;
- missing context never produces repo or Design System assertions;
- interrupted runs resume without duplicate events, findings, or CRRTs.

### End-to-end tests

Verify landing submission, live events, intervention, partial failure, empty result, claim, project publication, review-state ownership, sharing, and exhaustive-report creation.

## 19. Performance and product metrics

Initial performance targets:

- first progress event within five seconds at p50;
- URL-only audit completion within five minutes at p50 and ten minutes at p95;
- no duplicated findings or side effects across retries;
- bounded cost per anonymous run enforced by workflow budgets.

Primary quality metrics:

- percentage of top findings accepted as valuable;
- percentage promoted by a human to Ready;
- percentage that become shipped fixes;
- time from audit start to first accepted finding;
- fixes shipped per active user per week.

Finding count is a diagnostic metric, not a success metric.

## 20. Implementation decomposition

This product design spans several independently verifiable slices and must not be implemented as one large change. Each slice receives its own implementation plan and can ship behind a flag without weakening the final contracts.

1. **Audit foundation:** URL safety, persisted run/evidence/event contracts, budgets, checkpoints, fixture products, and contract tests.
2. **Internal vertical slice:** Explorer, deterministic scanners, Critic, Verifier, a read-only results workspace, and live progress for an authenticated internal project. This is the first end-to-end tracer slice.
3. **Anonymous landing entry:** Product Audit landing section, anonymous capability tokens, quotas, temporary workspace, and claim flow.
4. **Multiplayer controls and CRRT publication:** pause, resume, redirect, add context, team handoff, and idempotent open-CRRT creation.
5. **Connected context:** read-only GitHub evidence followed by the approved `template-ds` Brain contract and project adapter.
6. **Exhaustive report:** a separately budgeted authenticated run that expands coverage without lowering publication gates.

The first implementation plan covers slice 1 and enough of slice 2 to prove one complete URL-only audit against fixture products. Later plans preserve the blocking order above.

## 21. Rollout

1. Build the audit contracts, safety gate, evidence model, and deterministic fixtures.
2. Ship the Explorer and live event stream behind an internal flag with no publication.
3. Add Critic and Verifier evaluation against the default CRRT Brain.
4. Pass the golden-set release gates.
5. Enable authenticated internal projects and open-CRRT publication.
6. Enable anonymous URL-only audits with strict quotas.
7. Add `template-ds` connected Brain support after its production contract passes integration tests.
8. Enable the exhaustive report for authenticated projects.
9. Consider continuous deployment audits only after precision, cost, and intervention behavior are stable.

## 22. Approved decisions

- Product Audit complements the widget and appears after the interactive demo.
- The landing remains a marketing and widget-demo surface; results use a dedicated workspace.
- URL is required; repo and Design System are optional.
- The initial summary targets three to five findings but may return zero to five.
- Findings must be high-impact and high-confidence.
- The exhaustive report is an authenticated follow-up action.
- Results become open CRRTs authored by `CRRT Audit`; humans own Ready status.
- `template-ds` supplies approved, versioned rules and never grants authority to drafts or placeholders.
- The implementation is one product agent backed by a durable Explorer → Critic → Verifier workflow.
- Audit sessions are observable, interruptible, shareable, and handoff-friendly.
- An anonymous visitor can run a limited URL-only audit; deeper context and persistence require signup.
- CRRT can complete successfully with no findings.
