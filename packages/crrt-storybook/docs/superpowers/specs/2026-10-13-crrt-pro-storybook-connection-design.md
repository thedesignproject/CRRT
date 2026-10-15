# CRRT Pro Storybook connection design

Date: 2026-10-13

Linear: TDP-5796, with TDP-5793 and TDP-5795 as integration dependencies

## Outcome

A CRRT Pro project owner connects an existing Storybook from the current CRRT project setup card. Storybook is presented as a CRRT Pro integration, not as another product, site, or onboarding flow.

The user copies one command from CRRT:

```bash
npx @thedesignproject/crrt-storybook connect --code <one-time-code>
```

The command installs the existing CRRT addon through Storybook's official addon installer, claims the selected CRRT project, writes non-secret connection metadata, and reports success. The user remains on the CRRT project screen, whose state changes from `Waiting for Storybook` to `Storybook connected`.

## Product boundary

- CRRT owns the project, Pro entitlement, connection status, feedback, and Agent handoff.
- Storybook is one connection method alongside the existing Website/App widget.
- `@thedesignproject/crrt-storybook` remains a separate npm package only as an implementation detail. The customer does not need to understand the package split.
- There is no separate Storybook landing page, account, billing flow, or dashboard.
- The current CRRT project setup card gains a `Website / App` and `Storybook` choice. Project settings exposes the same integration after the empty state disappears.

## Chosen approach

Use the existing addon package with a small Node CLI and Storybook preset.

The CLI delegates addon registration to Storybook's official `storybook add` command instead of maintaining a custom parser for every possible `main.js` or `main.ts` shape. CRRT-specific connection metadata is stored in `.storybook/crrt.json`. A Storybook preset reads that file and exposes only non-secret values to the manager panel.

Alternatives rejected:

1. **Put the CLI in `@thedesignproject/crrt`.** This mixes the browser widget runtime with Node-only installation code and increases release coupling.
2. **Create a separate setup page.** This adds navigation and makes Storybook feel like a different CRRT product.
3. **Keep manual installation and parameters.** This preserves today's package architecture but fails the one-command onboarding requirement.

## Components

### 1. CRRT project setup card — TDP-5795

The existing empty-project card becomes a neutral connection surface.

- `Website / App` preserves the current widget instructions.
- `Storybook` displays one personalized command and connection status.
- The command contains a short-lived, single-use pairing code. It contains no reusable account token.
- States: not connected, waiting, connected, code expired, upgrade required, and error.
- Once feedback exists, the same controls live under Project settings → Integrations.

This UI is implemented in the CRRT application, not in the addon package.

### 2. CLI entry point — TDP-5796

Add a package binary that supports:

```text
crrt-storybook connect --code <code> [--api-base <url>] [--config-dir <path>]
crrt-storybook doctor
```

`connect` performs these steps:

1. Validate Node 20.19+ and locate the nearest package root.
2. Detect Storybook 10 and its configuration directory.
3. Detect npm, pnpm, yarn, or bun from the lockfile/package metadata.
4. Validate the one-time code with CRRT without consuming it.
5. Run Storybook's official addon installation command for `@thedesignproject/crrt-storybook`.
6. Claim the code and receive public connection metadata.
7. Write `.storybook/crrt.json` atomically and print a concise success message.

`doctor` validates package installation, Storybook registration, and connection metadata without changing files. Runtime API eligibility is surfaced by the panel, where the signed-in browser session is available.

The first supported release target is Storybook 10 with React. Other frameworks fail with an explicit compatibility message; the package does not claim support that CI does not verify.

### 3. Storybook preset — TDP-5796

The package adds a Storybook 10 ESM preset and root `preset.js` entry.

- Storybook discovers the package's `./manager` export exactly once; the preset handles connection metadata only.
- The preset reads `.storybook/crrt.json` at build/dev time.
- It injects only public connection values: `connectionId`, `projectKey`, `apiBase`, and `dashboardUrl`.
- No account token, pairing code, or private API credential enters the Storybook browser bundle.
- Existing explicit `parameters.crrt` values remain available as advanced overrides for local development and backward compatibility.

### 4. Panel connection states — TDP-5796

The existing compliance checks, manual feedback, story context, and sent states remain intact.

The panel adds a connection boundary with stable states:

- connecting
- authentication required
- ready
- access denied
- upgrade required
- seat limit reached
- session expired
- offline/error

Until TDP-5793 is live, the package targets a typed transport interface and test fixture. Public-project submissions continue through the existing endpoint.

### 5. Backend connection contract — TDP-5793

The CLI contract is fixed so frontend and backend can proceed in parallel. Validation happens before local changes. Claiming is idempotent for the same code during its short lifetime: it can return the same connection after an interrupted response, but it cannot create or authorize a second connection.

Validation request:

```json
{
  "code": "single-use-code"
}
```

Successful validation response:

```json
{
  "valid": true,
  "expiresAt": "2026-10-13T19:00:00.000Z"
}
```

Claim request:

```json
{
  "code": "single-use-code",
  "storybookVersion": "10.4.6",
  "addonVersion": "0.2.0",
  "packageManager": "pnpm"
}
```

Successful response:

```json
{
  "connectionId": "sbconn_public_opaque_id",
  "projectKey": "project-public-key",
  "apiBase": "https://crrt.ai/api",
  "dashboardUrl": "https://crrt.ai"
}
```

The pairing code expires quickly, is single-use, and is scoped to one project. The returned connection identifier is not an authorization secret. Private feedback still requires the signed-in user's short-lived CRRT session and server-side membership checks from TDP-5793.

## Data flow

1. The signed-in Pro owner selects `Storybook` in the existing CRRT setup card.
2. CRRT issues a one-time project pairing code and renders the copyable command.
3. The CLI validates the code, installs the addon, claims the code, and writes public connection metadata.
4. CRRT records the connection and the existing card updates to `Storybook connected`.
5. Storybook loads the CRRT panel through the preset.
6. The panel reads the public connection identifier and asks CRRT for the current user's eligibility.
7. The user sends manual feedback or a failed built-in check with story/component context.
8. CRRT stores the feedback in the selected project and preserves the existing dashboard → Agent workflow.

## Failure and recovery behavior

- Missing Storybook: stop before changing files and explain how to install Storybook.
- Unsupported Storybook/framework: stop with the exact supported path; do not perform a partial install.
- Expired or already-used code: do not modify the project; tell the user to generate a fresh command in CRRT.
- Addon installation failure: the code remains unclaimed; do not write connection metadata, and surface the underlying Storybook command and exit code.
- Metadata write failure: leave the addon installed, report the incomplete connection, and make rerunning safe.
- Re-run after success: detect the existing addon and update/verify connection metadata without adding duplicate config.
- Network failure: preserve no pairing code or token on disk. An interrupted claim can be retried idempotently with the same still-valid code; otherwise CRRT generates a fresh command.
- Private access revoked: the panel fails closed and offers CRRT re-authentication; it never falls back to public submission.

## Packaging and release

- Target Storybook 10 and Node 20.19+ in the first release.
- Use ESM-only addon output and a root `preset.js`, matching Storybook 10 addon guidance.
- Add `prepack` so npm artifacts are always built from a clean `dist`.
- Publish the CLI binary, preset, manager bundle, types, README, and license only.
- The README must not claim Storybook 9 or non-React compatibility until tested.
- The README distinguishes declared governance rules from the four checks currently computed against the DOM.
- The release is owned by TDP-5797 after package verification succeeds.

## Testing

Unit tests:

- argument parsing and code redaction
- package-manager and Storybook detection
- claim response validation
- atomic config write and idempotent reruns
- connection-state mapping
- API errors never fall back from private to public submission

Integration tests:

- a Storybook 10 + React fixture installs through the CLI
- the official Storybook CLI registers the addon once
- Storybook dev/build loads the panel from the published package shape
- `.storybook/crrt.json` reaches the panel as public configuration
- `npm pack --dry-run` contains every required runtime file and no source-only/demo artifacts

CI gates:

- typecheck
- unit/integration tests
- addon build
- fixture Storybook build
- clean package-content verification

End-to-end product rehearsal remains in TDP-5798 using `template-ds`, replacing its duplicate custom panel with this package.

## Definition of done

TDP-5796 is done when a clean supported Storybook project can run the copied CRRT command, install and register the real addon exactly once, persist only non-secret connection metadata, build successfully, and show the existing CRRT panel in a state ready to consume TDP-5793's private-session endpoint.
