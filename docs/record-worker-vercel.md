# Recording processing on Vercel

Production uses private R2 storage and the existing Supabase recording job queue.
Vercel Cron calls `/api/v1/internal/record-worker` every minute. The authenticated
handler sweeps expired recordings and starts a Workflow only when work is waiting
and no job has a live lease. The Workflow launches the bundled existing worker in
a Vercel Sandbox with FFmpeg, polls its detached command, and stops the VM when
the command finishes. Vercel records a command's exit code only for a request
that waits for it ([Get a command](https://vercel.com/docs/rest-api/sandboxes/get-a-command));
plain status reads report `null` even after exit. Each status check therefore
waits up to 10 seconds, so success and failure both release the worker slot
promptly. A one-shot worker explicitly exits after its awaited stage calls, so
open network handles cannot keep it alive. Status checks and stops use the VM's
current session and never resume a stopped VM (SDK calls otherwise auto-resume);
an ended VM fails the run as `record_worker_sandbox_<status>`. Worker logs record
only error type/code and the active handle types at exit. The VM has a hard
30-minute timeout and no persistent snapshot. Database leases, heartbeats, retries, and cleanup remain authoritative.

The existing GitHub production deployment builds and ships both the Workflow
and worker bundle. No Cloudflare Worker, Container, or paid Cloudflare plan is
needed. Ordinary Vercel Functions never download recording media into their
limited temporary filesystem. Only worker configuration is forwarded to the VM;
Vercel credentials and unrelated deployment secrets are excluded.

Use the production project's existing `CRON_SECRET`, `CRRT_RECORD_ENABLED=true`,
Supabase service credentials, and `RECORD_R2_*` configuration. The Sandbox SDK
authenticates with Vercel's deployment OIDC token. `VERCEL_PROJECT_ID` and
`VERCEL_ENV` identify the worker's environment. Preview deployments do not run
Vercel Cron. Hosted transcription still requires its existing consent, policy,
provider key, and quota configuration.

Sandbox and Workflow use the current Vercel plan's allowances and metered usage.
This change does not upgrade a plan or adjust billing settings. No session is
created for an empty queue. One worker pass handles at most one job per stage;
the next cron invocation handles remaining work. Concurrent cron deliveries
share a minute-based Sandbox name, and active VMs prevent additional launches.

After merging, verify the production cron succeeds, the queued recording's
metadata/transcription/alignment stages finish, and its private player becomes
ready. Then record and upload another neutral page and verify cloud playback.
Chrome Web Store submission remains gated on that production check.
