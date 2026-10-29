## Read order for agents

These instructions apply to any coding agent working in this repo, including Claude Code, Codex, and Cursor.

- Any change -> read `rules/engineering.md`.
- UI or design changes -> read `rules/ux.md` and `branding/CRRT-DESIGN-SYSTEM.md`.
- Data, schema, or API changes -> read `rules/security.md` and `db/DRIZZLE-GUIDE.md`.
- Product or copy decisions -> read `rules/business.md`.

# Repo notes for AI agents

## Publishing npm widget updates

Changes affecting the published `@thedesignproject/crrt` package's user experience,
behavior, public API, or installation must ship in an npm release. A merge to
`trunk` deploys the hosted CRRT application; it does **not** publish the npm package.
Dashboard-, backend-, or landing-only changes do not require a widget release
unless they also change the package. Related widget PRs may ship in one release.

For each package-affecting PR, identify its release plan. Before publishing:

1. Include all intended widget changes in the release, and open a version-bump PR
   updating the root `package.json` and `docs/CHANGELOG.md`.
2. Merge the reviewed release PR into `trunk` after its required checks pass.
3. Create **and push** a tag on the exact release merge commit. Do not tag a moving
   branch tip or an unmerged feature branch. The tag version must match that
   commit's root `package.json`; never move or overwrite an existing release tag.

Run these commands when publishing is authorized, replacing both example values:

```bash
release_version='0.3.23' # Example only; use the approved release version.
release_commit='REPLACE_WITH_RELEASE_MERGE_COMMIT_SHA'
git fetch origin trunk --tags
git show "${release_commit}:package.json" # Confirm its version matches.
git merge-base --is-ancestor "$release_commit" origin/trunk &&
  git tag "v${release_version}" "$release_commit" &&
  git push origin "refs/tags/v${release_version}"
```

Pushing the `v*` tag triggers `.github/workflows/publish.yml`, which validates the
package and publishes it to npm. Creating a local tag alone is not enough.

```bash
gh run list --workflow=publish.yml --commit "$release_commit" --limit 3
gh run watch <publish-run-id> --exit-status
npm view "@thedesignproject/crrt@${release_version}" version
npm view @thedesignproject/crrt dist-tags.latest
```

Replace `<publish-run-id>` with the matching tag-triggered run's ID. Do not report
the update as released until that run succeeds and npm contains the expected
version (and `latest` points to it for a stable latest release). Consumers must
then update their dependency and redeploy. If publication is still pending,
explicitly distinguish **merged**, **hosted deployment**, and **published to npm**.

## Database changes

**ALL schema changes go through `db/schema.ts`.** Do not write hand-rolled SQL files. Do not edit existing migration files in `db/migrations/`.

Read **`db/DRIZZLE-GUIDE.md`** before any schema change — it has the full rules, gotchas, and the rename-without-data-loss recipe. Quick command reference lives in `db/README.md`.

Supabase client (`@supabase/supabase-js`) stays the runtime query layer. Do **not** migrate `api/` query call sites to Drizzle's query builder.

## Legacy schema files

`supabase/legacy/` is frozen historical record from before Drizzle. Do not add new files there. Do not run those SQLs against any environment.

## Dashboard routing

The dashboard ships under a base path (`/dashboard/`), so all in-app routes/links and public assets must be base-aware — use `route()`/`asset()` from `apps/dashboard/lib/routes.ts`, never hardcode absolute `/foo` paths.

## Diff coverage

After any code change, MUST invoke the repo-local `$diff-coverage` skill from `.agents/skills/diff-coverage` before handing work back. Both line and branch diff coverage against the current PR's base are required at 100%. For stacked PRs, validate every layer against the branch immediately below it, not against `trunk`.
