# CRRT Storybook monorepo migration plan

Design: `docs/superpowers/specs/2026-10-15-crrt-storybook-monorepo-migration-design.md`

## 1. Import the verified package

- Import `thedesignproject/crrt-storybook/main` into `packages/crrt-storybook`.
- Remove repository-only workflow metadata from the nested package.
- Preserve package metadata, lockfile, tests, fixture Storybook, README, license, and verification scripts.
- Add nested generated artifacts and connection metadata to ignore rules.

## 2. Add package-scoped CI

- Add a root workflow triggered by addon paths.
- Run the same Node version and commands as the standalone repository.
- Keep root CRRT CI and deploy jobs unchanged.

## 3. Add an isolated release workflow

- Trigger only on `crrt-storybook-v*` tags.
- Verify the tag against `packages/crrt-storybook/package.json`.
- Run all package and clean-consumer checks before publishing.
- Publish from the package directory with provenance and `NPM_TOKEN`.

## 4. Verify and open the migration PR

- Run addon typecheck, tests, Storybook build, package verification, and clean-consumer verification locally.
- Run root secret scanning/diff checks applicable to the changed files.
- Confirm the root package and existing `v*` publication workflow are untouched.
- Push the branch and open a PR describing the exact release tag and maintainer handoff.

## 5. Release and migrate the demo consumer

- After merge, Pranav exposes the existing token to the workflow and pushes `crrt-storybook-v0.1.0`.
- Verify the registry package.
- Replace the temporary tarball in `template-ds`, rerun its checks, and open the consumer PR.
- Archive the standalone repository only after the registry install and consumer build pass.
