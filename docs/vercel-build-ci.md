# Vercel prebuilt deployment trial

The deployment job runs on `blacksmith-4vcpu-ubuntu-2404`, with Node 24 and
Bun 1.4.4. It archives the exact deployment commit into a temporary directory,
pulls the matching Vercel environment, and runs `bun run deploy-build` once there.
Preview builds also specify the PR's branch when pulling environment variables.
The existing cloud validation, typecheck, frontend builds, workflow registration,
API packaging, and database migrations remain in that command.

The resulting `.vercel/output` is checked before uploading with
`vercel deploy --prebuilt --archive=tgz`. We intentionally do not run
`vercel build`: it would invoke Vercel's source builders again, which is the
redundant API build pass this trial aims to remove.

`scripts/verify-vercel-output.mjs` requires the API router, raw-body Stripe
webhook, public-site function, and all three Workflow SDK functions. It also
checks the workflow registration, key static entrypoints, and API routing order.
Unexpected per-route API functions fail validation rather than hiding a second
build pass. Preview runtime checks are still needed before merging this trial;
filesystem checks cannot prove every deployed handler behaves correctly.

Environment files remain in the runner's temporary source directory. They are
not printed, uploaded as artifacts, or included in a persistent dependency cache.
The function builders already exclude `.vercel/**` from source packaging.
System environment variables that depend on the final deployment URL remain
runtime values; build metadata supplies the target, commit, and branch.

GitHub deployment and comment API calls retry transient server errors. The
same-repository PR guard, deployment targets, and production flag are preserved.

Compare the named **Build deployment once on Blacksmith** and **Deploy to
Vercel** steps against the previous remote-build deployment. This trial adds no
build cache initially, so a first run may be slower than subsequent cached runs.
