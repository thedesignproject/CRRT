# CRRT Storybook monorepo migration

**Date:** 2026-10-15

**Package:** `@thedesignproject/crrt-storybook`

**Source repository:** `thedesignproject/crrt-storybook`

**Destination:** `packages/crrt-storybook` in `thedesignproject/CRRT`

## Goal

Make CRRT the single repository that owns the dashboard, Storybook authentication backend, addon, CLI, verification, and npm release. Preserve the already-verified `0.1.0` package behavior and public package name.

## Decision

Move the addon into `packages/crrt-storybook` as an independently installable package with its own `package.json` and lockfile. Do not convert the entire CRRT repository to workspaces during the launch window: that would unnecessarily change the root dependency graph and deployment pipeline. Repository colocation gives agents and maintainers one source tree now; workspace unification can be evaluated separately.

The alternatives were:

- keep the separate repository, which preserves release isolation but splits product context and duplicates repository administration;
- convert all of CRRT to a package workspace immediately, which is structurally clean but expands the migration into every root install, build, and release path;
- colocate an isolated package, the selected option, which provides one repository without destabilizing the existing application package.

## Repository layout

`packages/crrt-storybook` contains the complete publishable addon: source, tests, package metadata, package lock, Storybook fixture, documentation, license, and package verification scripts. Generated output, local Storybook output, connection metadata, and installed dependencies remain ignored.

The existing external repository remains available until the npm release and consumer verification pass. It is archived only after the monorepo package is proven; no history or working release path is deleted during migration.

## Continuous integration

Add a package-scoped workflow that runs when `packages/crrt-storybook/**` or its workflow changes. It uses the package directory as its working directory and runs:

1. `npm ci`
2. type checking
3. package tests
4. example Storybook build
5. package-content verification
6. clean-consumer verification

The existing root CRRT workflows remain unchanged. The nested package must not rely on root dependencies or generated root artifacts.

## Publishing

Add a dedicated workflow triggered by tags matching `crrt-storybook-v*`. This avoids collisions with the root `@thedesignproject/crrt` package's existing `v*` tags and workflow.

The publish job:

1. checks out the tagged commit;
2. installs and verifies the nested package;
3. verifies that `crrt-storybook-vX.Y.Z` matches the nested `package.json` version;
4. publishes from `packages/crrt-storybook` with public access and npm provenance;
5. uses the existing CRRT repository `NPM_TOKEN` secret supplied by the maintainers.

The first release tag is `crrt-storybook-v0.1.0`. A tag is created only after the migration PR is merged and the package-scoped CI is green.

## Consumer transition

After npm reports `@thedesignproject/crrt-storybook@0.1.0`, replace the temporary local tarball in `template-ds` with the exact published version, regenerate its lockfile, and rerun its typecheck, lint, Brain/meta validation, and production Storybook build. The Dianne rehearsal uses only the published package; it must not depend on a local path or copied build artifact.

## Failure and rollback

- A tag/version mismatch fails before publishing.
- A verification failure prevents the publish job.
- An unavailable or unauthorized `NPM_TOKEN` fails without modifying npm; Pranav or Alessandro can repair the secret and rerun the workflow.
- If `0.1.0` publishes but consumer verification fails unexpectedly, do not overwrite the immutable version. Fix forward with `0.1.1`.
- Do not archive the external repository until npm installation and the `template-ds` build succeed.

## Acceptance criteria

- The addon and CLI live under `packages/crrt-storybook` in CRRT.
- Package-scoped CI passes without changing root CRRT behavior.
- `crrt-storybook-v0.1.0` publishes the nested package and cannot trigger the root package release.
- `npm view @thedesignproject/crrt-storybook version` returns `0.1.0`.
- A clean Storybook 10 React consumer installs the registry package and builds.
- `template-ds` no longer references a local tarball or duplicate CRRT panel.
