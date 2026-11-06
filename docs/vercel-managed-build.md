# Consolidated Vercel-managed builds

The Vercel project uses a Vite preset, but `deploy-build` already creates complete
Build Output API v3 output in `.vercel/output`. Automatic API discovery previously
also compiled every `api/**/*.ts` route, producing 92 functions: 86 per-route API
functions plus the six functions from our custom packager.

`vercel.json` now selects one explicit `@vercel/static-build@26.0.1` builder for
`package.json`. This is Vercel's legacy `builds` configuration: it is deliberate
here because it disables default API discovery while retaining Vercel-managed
builds and variables. The static builder calls the `vercel-build` package script
and recognizes the generated Build Output API output. The package script uses
the installed Bun binary to run `deploy-build`, avoiding a nested Bun download
through `npx`/`bun x`. The managed builder selects Bun from the lockfile.

Each nested API builder receives a temporary package manifest with `vercel-build`
and `now-build` removed. `@vercel/node` searches parent package manifests for
those hooks even when its build-command option is disabled; forwarding the
deployment alias would recursively restart the entire project build. Dependency
and patch declarations are preserved, and the actual project manifest is unchanged.
The top-level alias also rejects recursive entry through an inherited environment
marker, providing a second guard if a future builder forwards deployment hooks.
The GitHub deployment trial has a five-minute timeout instead of fifteen.

Dashboard build/output values are not the source of truth. The existing root
command overrides remain for tools using the zero-config path; the explicit
builder uses the `vercel-build` package script. No dashboard or variable changes
are needed. The GitHub job still uploads source for Vercel to build, on
`ubuntu-slim`; neither environment downloads nor Blacksmith builds are used.

The explicit builder cannot be combined with the root `functions` property.
Function configuration therefore comes from generated `.vc-config.json` files.
Both API functions retain the 60-second limit of the former per-route functions.
Stripe keeps its separate raw-body handler; the public-site and Workflow SDK
functions retain their existing configuration.

`scripts/verify-vercel-output.mjs` runs at the end of packaging and requires six
functions, the Product Audit workflow registration, key static entrypoints,
API routing order, and Stripe raw-body handling. Real preview route checks are
still needed before merging: filesystem checks cannot prove every handler works.

Measure the remote build and check the deployment's Functions list. Expected:
six functions, no separate `/api/v1/...` functions. Environment validation and
database migration remain inside the original Vercel-managed build command.
