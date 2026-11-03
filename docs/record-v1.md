# Record V1 backend handoff

TDP-5959. Local implementation based on Tomás's PR #350,
`tomas/tdp-5958-record-v1-demo`. The shared contract is ready for review with
Tomás; frontend acceptance/agreement is still a coordination step.

## Local verification

Use the existing CRRT Supabase Docker stack (`crrt-local` network). Copy the
local Docker environment file into this worktree without committing it. These
commands reject non-loopback database targets and provision only local storage:

```powershell
bun scripts/record-local.ts provision
bun scripts/record-local.ts integration
bun scripts/record-local.ts transcription-test
bun scripts/record-local.ts test
```

The integration command uses real Supabase Auth, REST, private Storage, signed
TUS uploads, PostgreSQL transactions and FFmpeg. It injects a speech adapter;
no narration goes to Deepgram. It creates and removes its own users, recordings,
objects, billing fixtures and project. Test-only billing rows do not call Stripe.
The test command runs Vitest on Node in Docker, including the coverage tools.
Database transaction tests can also run with `RECORD_TEST_LOCAL=1` against the
loopback Docker database. Never point the integration tests at hosted services.

## Contract

Browser-safe schemas and types live in `shared/record/contracts.ts`; deterministic
fixtures live in `shared/record/fixtures.ts`. Keep the existing recorder reducer:
an adapter maps local capture state into these transport contracts. Setup,
countdown and pause are recorder states; backend states are recording, uploading,
processing, ready and failed. Processing failures include stage, code and
retryable; they preserve source media. A silent/declined transcript is empty.

All capture times are integer milliseconds on the primary screen's monotonic
timeline, with pauses excluded. Screen starts at zero; camera/audio offsets are
nonnegative. Transcript offsets are applied once by the worker. Events have
stable UUIDs and contiguous zero-based sequence numbers; sort by time, retaining
sequence as the tie-break. At most 500 events, one artifact per source kind,
five minutes per recording and 1 GiB per source artifact are accepted. Capture stops
and saves automatically after five minutes of recorded time, excluding pauses.
Owners can delete cloud recordings from either library; local copies are retained.
The existing cleanup worker releases quota after file cleanup (up to 26 hours). Annotation
points/crops/bounds are normalized; capture and viewport dimensions use pixels.
Window/screen manifests must omit DOM targets. Marks do not create carrots.
Hash-router paths (`#/checkout` and `#!/checkout`) remain identifiable; their
query parameters are redacted just like ordinary URL queries.

Every owner endpoint requires a Supabase user bearer token. Project attachment
requires an admin/member with access to the destination's private context;
detachment does not require continuing project access. Attachment adds context,
not implicit project-wide access to a personal recording. Agent output additionally
requires current project Agent permission and the project's sponsor entitlement.

| Method | `/api/v1/` path | Request / response |
|---|---|---|
| POST | `recordings` | `{clientKey,title,source,consent}` → recording summary and immediate `shareId` |
| GET | `recordings?before=<recording UUID>` | Owner-only cursor page, up to 50 summaries and next cursor |
| GET | `recordings/capabilities` | Free human capabilities, personal paid eligibility, Record limits and usage |
| GET/PATCH/DELETE | `recordings/:id` | Summary / `{title}` / idempotent deletion and cleanup schedule |
| POST | `recordings/:id/project` | `{projectKey:string|null}` |
| POST | `recordings/:id/uploads` | Artifact declaration → scoped signed TUS authorization |
| POST | `recordings/:id/complete` | `{artifactId}` → verified storage completion |
| POST | `recordings/:id/finalize` | Immutable versioned manifest → processing state |
| POST | `recordings/:id/retry` | `{stage:metadata|transcription|alignment}` for a retryable failed stage |
| GET | `recordings/:id/playback` | Owner playback, signed artifacts and synchronized context |
| GET/POST/DELETE | `recordings/:id/share` | Read current link / enable sharing idempotently / unshare |
| GET | `recording-shares/:token` | Anonymous human playback/state, authorized only by opaque capability |
| POST | `recordings/:id/agent-payload` | `{requestKey:UUID}` → paid deterministic payload and digest |

Owners can share from dashboard library cards or the recording player's Share
dialog. Reading/copying a link never rotates it. GET returns the current link or
`shareId:null` when unshared; POST reuses an active link and idempotently enables
a fresh generation after unsharing. DELETE disables sharing and invalidates all
previous generations. Already issued playback URLs can last up to 300 seconds.
Initial 43-character links remain compatible. Re-enabled links carry a versioned
recording ID and a server-keyed MAC bound to a random persisted generation; they
require the same stable `SHARE_TOKEN_SECRET` across API instances. Tokens stay in
URL fragments, and public playback rechecks the generation after signing.

The player fullscreens the composed video, annotation overlay and camera controls
together. Long freehand strokes are resampled deterministically to at most 2,048
points with endpoints retained, including old locally staged captures at upload.
Live strokes use a streaming stride that retains samples throughout the complete
trajectory instead of repeatedly removing midpoint samples. Capture accepts at
most 500 marks and 600,000 serialized annotation bytes; at capacity it keeps
recording and explains how Undo/Clear frees space. Generated titles fit 240
characters without truncating the complete note or splitting an emoji.
Capture rejects notes above 2,000 characters with an actionable warning. Older
local recordings with oversized notes show a repair editor before uploading;
the complete original stays saved until the user explicitly applies shorter
notes. Editing preserves media, mark IDs, geometry and timestamps.
Before uploading, the entire serialized manifest is compacted below 900,000 bytes
to fit the API's 1 MiB request limit. Geometry is resampled across all strokes as
needed; timestamps, text, DOM metadata and artifact identities are retained.
Older staged manifests above the hard request limit can be repaired without
reuploading media. Previously acceptable manifests remain byte-for-byte unchanged
when retrying a lost finalization response.
Durable transcription propagates job cancellation into provider HTTP requests,
checks cancellation around quota admission, and rechecks access after preparing
audio. Cancellation prevents a new provider dispatch once detected; already sent
audio remains subject to the provider's documented deletion policy.
Transient heartbeat storage errors preserve their retryable failure classification;
they are not treated as confirmed deletion or lease cancellation.
The persistent transcription reservation RPC accepts worker audio through 32 MiB;
configured owner/global byte budgets still apply. The legacy demo upload endpoint
retains its separate 4 MiB input bound.

The extension now uploads through `lib/recording-cloud.ts`, keeping its existing
recorder reducer and local IndexedDB media. The upload adapter owns TUS details;
it persists each session Location before sending chunks and reads HEAD offsets
when resuming. Uploads require the real extension Supabase session. An immutable
manifest and stable create/artifact IDs survive reloads, with Web Locks preventing
parallel uploads from recorder windows. Failed uploads retain local media.

After capture, private upload starts automatically for signed-in users. Hosted
transcription requires the explicit Deepgram checkbox; older local captures have
no implicit hosted consent. The authoritative transcript comes from background
processing, not the account-free demo endpoint. The review polls processing and
offers stage retry and server-authorized paid context generation.

Both the dashboard owner player and extension review show stage-specific recovery.
The worker's existing automatic retries run first (up to three attempts per stage).
Only a retryable stage in `failed` state exposes a manual action: Retry video,
Retry transcription, or Retry key moments. Public viewers see the status without
owner actions. Retrying preserves playback, transcript data and successful stages;
only the selected failed stage is queued again. Request errors retain the retry
action, and buttons are disabled while the request is pending.

The dashboard and extension library list actual owner recordings. The dashboard
serves anonymous human playback at `/dashboard/recording#<capability>` and
authenticated library playback at `/dashboard/recording?id=<recording UUID>`.
Share capabilities stay in fragments, rather than HTTP page URLs/referrers.
Early links show processing state; verified playback uses expiring private URLs,
with transcript/mark/keyframe seeking and an optional synchronized camera track.
Private library playback stays inside the dashboard navigation and links back to
Recordings; anonymous share playback remains standalone. Tab captures include the
injected camera bubble in the primary video, so new tab captures do not encode or
upload an additional camera artifact, and playback ignores legacy tab camera
artifacts. Window and screen captures retain their independent camera track; its
playback bubble sits above the video controls.
The extension's explicitly labelled local link remains browser-only.

Supabase and Cloudflare R2 are supported storage providers. Backend object operations
live behind `api/_lib/record/object-storage.ts`; the extension selects TUS or S3
multipart transport from the server authorization. Provider details stay outside
recorder state and do not change the immutable event/artifact manifest.

Create and payload retries retain their keys. Reusing a create key with changed
content conflicts. Create retries recover the initial share capability unless it
has since been rotated/revoked; in that case `shareId` is null. Signed upload
authorization can be reissued for the same immutable declaration. Complete and
finalize are idempotent; a different finalized manifest conflicts. Canonical JSON
hashing ignores object-key order but preserves array/event order.

The upload response contains `protocol:tus`, `endpoint`, `headers.x-signature`,
bucket, immutable path, TUS metadata, 6 MiB chunk size and 7200-second authorization
lifetime. Send media directly to its `/storage/v1/upload/resumable/sign` endpoint.
Keep the resulting TUS Location and reconnect with HEAD/Upload-Offset; API
functions never proxy media. No user-selected storage paths or upserts are allowed.
Storage's bucket cap is exactly 1 GiB. Because its signature does not bind declared
length, authorization reserves that maximum until immutable completion verifies
actual size/type. Finalization reserves a bounded derivation budget; successful
processing replaces it with actual derived bytes. Provisioning must preserve
that private bucket and its object cap. Workers verify source SHA-256 before use;
playback is withheld until source verification/media derivation succeeds.

Errors are `{error:{code,retryable}}` for Record failures: `record_invalid` (400),
`record_payload_too_large` (413), `record_not_found` (404, including cross-owner),
`record_forbidden` (403), `record_upgrade_required` (402), `record_conflict`,
`record_not_ready`, `record_upload_incomplete`, `record_artifact_mismatch` (409),
`record_quota` (429), and disabled/configuration/unavailable errors (503).
The existing authentication boundary returns its established 401 response.
Poll state after ambiguous network failure before retrying mutations. Retry
transport/provider failures with bounded exponential backoff and the same keys;
do not retry validation/permission/entitlement failures without changing inputs.

## Processing, retention and access

The Docker worker consumes durable database jobs with SKIP LOCKED, five-minute
leases, heartbeat renewal, bounded exponential backoff and three automatic
processing attempts. Metadata, transcription and alignment have separate commit
boundaries. Crashed workers can be reclaimed; stale leases cannot commit. Alignment
waits for successful metadata and transcription. Event frames align to transcript
intervals expanded by three seconds. Thumbnail/keyframe/crop identities and
private paths are deterministic across retries; existing bytes are never overwritten.
Live WebM is stream-copied to a temporary indexed container first, so missing
MediaRecorder Duration/Cues are supported and each frame uses indexed input
seeking instead of re-decoding the recording prefix.
For sparse captures with no frame at the requested end timestamp, extraction
falls back to the preceding keyframe. Crops are bounded to at least one pixel;
all derived images fit within 640 by 640 pixels, with aspect ratio preserved
to the nearest pixel and neither dimension allowed to round to zero.
Derived writes use expiring scoped upload signatures, lease checks before/after authorization and upload,
and cancellable operation deadlines. Temporary indexed files are not retained.

Deletion immediately revokes API/share access, then delays artifact cleanup two
hours to outlive outstanding signed upload authorizations. Abandoned unfinalized
sessions expire after 24 hours. A continuously running healthy worker therefore
reclaims abandoned objects after roughly 26 hours, plus queue time. Cleanup runs
in bounded object batches and retries indefinitely on storage outages; it never
marks cleanup complete before storage deletion succeeds. Account deletion leaves
tombstones and immediately revokes sharing in the same database transaction.
The immutable storage prefix survives artifact-metadata removal; deleted
tombstones are reconciled hourly to catch externally delayed writes. Failed processing
retains source media until the owner deletes it. Operators must monitor stalled
cleanup jobs; no hard deletion-time guarantee is possible during storage outages.

Human sharing and playback never consult paid entitlement. Tokens are 256-bit
capabilities stored only as hashes, and responses have no-store/no-referrer.
Playback URLs expire after five minutes; revocation prevents issuing new URLs,
while an already issued URL can remain valid until expiry. Project instructions,
consent and billing data never appear on human share responses. Agent payloads
are owner-authenticated, exclude video bytes, include all transcript/events and
actual frame/crop references, and query current instructions. The canonical payload
contains stable artifact IDs/checksums; the response's separate `artifactAccess`
list maps them to five-minute signed image URLs that agents can actually fetch.
Those URLs do not change the canonical digest. An idempotent paid payload request
can renew them after rechecking entitlement. `brainReferences:[]` is reserved.

Record has its own usage ledger and quotas, never comment/carrot usage. Local
defaults are 25 retained recordings, 5 GiB reserved storage, and 100 paid payload
requests/day. These are configurable operational defaults, not approved launch
pricing. Cloud reuses the existing Pro/Studio, legacy-account and project-sponsor
entitlement policy; Community keeps its existing self-hosted entitlement behavior.

## Hosted transcription activation policy

Durable recording jobs reserve these same Postgres budgets before each hosted
provider attempt, including retries. Their hourly identity is the authenticated
recording owner, HMACed separately from IP identities; the daily global budget is
shared with the account-free endpoint. Exhausted or unavailable admission becomes
a retryable processing failure without deleting media or calling Deepgram. Audio
duration is measured locally against the remaining recording timeline before
provider dispatch (with the same two-second media clock tolerance).

The account-free `POST /api/v1/extension/recordings/transcribe` endpoint also
requires `RECORD_DEMO_TRANSCRIPTION_ENABLED=true`. Origin validation is CORS,
not authentication. Before every provider call it atomically reserves persistent
Postgres budgets: by default 6 requests / 16 MiB per client per UTC hour, and
100 requests / 128 MiB globally per UTC day. Environment overrides are listed in
`.env.example`. Reservations are not refunded for provider failures or timeouts.
Limited requests return 429 with `{error:string}`; missing quota storage,
invalid configuration, or an unavailable trusted client address returns 503
without calling Deepgram. OPTIONS and invalid media do not consume quota.

On Vercel the overwritten `X-Forwarded-For` ingress header supplies the address;
other runtimes use the socket peer and ignore forwarding headers. Reverse-proxy
deployments consequently share the proxy's client quota unless that trust boundary
is deliberately implemented. Addresses are normalized and HMACed with the
server's stable `SHARE_TOKEN_SECRET`; raw addresses and provider keys are not
stored in the budget table. Global admission remains bounded even if clients
rotate addresses. Request/byte budgets limit admissions, not measured provider
minutes or a guaranteed dollar amount. The provider account's spend ceiling
remains an operator control. Expired client buckets are pruned on admissions.

`transcription-test` exercises real HTTP and quota storage with a loopback provider
fake, including concurrent calls, spoofed headers, 429 responses, retained failure
charges and a revoked quota RPC. It never sends audio to hosted Deepgram.

Hosted transcription is OFF by default. Deepgram Nova-3 is the implemented
adapter; `multi`, English and Spanish are accepted. Audio is sent only after the
recording's explicit `record-v1` consent and provider/language selection. Temporary
audio derivatives are removed after the stage, including failures. Uploaded
screen/camera/audio remain private until owner deletion; derived context is
removed by the same cleanup lifecycle. The server never logs media, transcript
text, tokens, provider response bodies or project instructions.

Before production activation the product/operator must approve the actual
Deepgram account's retention/training settings, deletion process, supported
language behavior, processing region/subprocessors, privacy disclosure and consent
copy. The repository does not establish a vendor zero-retention guarantee.
Set `RECORD_TRANSCRIPTION_ENABLED=true` and
`RECORD_TRANSCRIPTION_POLICY_VERSION=record-v1` only after that approval, with a
server-side `DEEPGRAM_API_KEY`. The legacy account-free demo endpoint is separately
disabled by default; do not enable `RECORD_DEMO_TRANSCRIPTION_ENABLED` in production.

Structured DOM context accepts no input values or DOM HTML; URL credentials,
query parameters and non-router fragments are discarded. Video/audio and explicit user text
are not automatically redacted. The frontend must disclose that visual secrets
can remain in captured media and give the user a chance to stop/delete before
sharing. Do not claim that this backend masks captured pixels or narration.

## Record environment variables

All Record variables are listed in `.env.example`. Example flags are disabled by
default; enable them deliberately for the deployment being activated. Credentials
are server-only and must never have `VITE_` or `WXT_` prefixes.

| Variable | Example default / value | Used by |
| --- | --- | --- |
| `CRRT_RECORD_ENABLED` | `false`; set `true` to enable | API and processing worker |
| `RECORD_STORAGE_PROVIDER` | `supabase`; set `r2` for Cloudflare | API when creating recordings |
| `RECORD_R2_ACCOUNT_ID` | Cloudflare account ID | API and worker |
| `RECORD_R2_BUCKET` | Private bucket, e.g. `crrt-record-media` | API and worker |
| `RECORD_R2_ACCESS_KEY_ID` | Bucket-scoped S3 access key ID | API and worker; secret configuration |
| `RECORD_R2_SECRET_ACCESS_KEY` | Corresponding S3 secret access key | API and worker; secret configuration |
| `DEEPGRAM_API_KEY` | Hosted transcription key | Worker; also the demo endpoint only if enabled |
| `RECORD_TRANSCRIPTION_ENABLED` | `false`; set `true` after policy approval | Worker |
| `RECORD_TRANSCRIPTION_POLICY_VERSION` | `record-v1` | Worker; must match the approved consent policy |
| `RECORD_DEMO_TRANSCRIPTION_ENABLED` | `false`; keep disabled in production | API; legacy account-free transcription endpoint |

Set API variables in the appropriate Vercel environment. Adding worker settings
to Vercel does not configure or start the independent worker: supply its R2 and
transcription settings in its own environment too. The worker also uses the
existing hosted Supabase credentials and the same stable `SHARE_TOKEN_SECRET`
as the API for transcription quota identities. Environment values alone do not deploy the
worker or apply the Record migration.

Optional limits are `RECORD_MAX_RECORDINGS=25`,
`RECORD_MAX_STORAGE_BYTES=5368709120` and `RECORD_MAX_PAYLOADS_PER_DAY=100`.
The four persistent transcription admission budgets apply to both API and worker;
configure the same limits in both environments. They are documented in the hosted
transcription policy above and `.env.example`.

Leave `RECORD_R2_ENDPOINT` unset for Cloudflare; it exists only for local S3
integration tests. The optional `DEEPGRAM_API_BASE_URL` defaults to
`https://api.deepgram.com` and is a server-side provider/test override.
Set `WXT_RECORD_STORAGE_ORIGIN=https://ACCOUNT_ID.r2.cloudflarestorage.com`
in the extension build environment, not the dashboard build. It contains no key
and grants the extension permission to contact that exact R2 origin.

## Private Cloudflare R2 media

`RECORD_STORAGE_PROVIDER=r2` routes new Record media to R2. Set the server and
worker's `RECORD_R2_ACCOUNT_ID`, `RECORD_R2_BUCKET`, `RECORD_R2_ACCESS_KEY_ID` and
`RECORD_R2_SECRET_ACCESS_KEY`. Use a bucket-scoped Object Read & Write S3 token;
Wrangler's OAuth login is for provisioning, not runtime S3 credentials. Leave
`RECORD_R2_ENDPOINT` unset outside local tests. Database metadata remains in
Supabase. Each recording stores its provider and bucket, so existing Supabase
recordings continue playing and cleaning up after a configuration switch.

Sources upload directly using 8 MiB S3 multipart parts and 15-minute presigned
URLs. The owner API signs only declared part numbers and exact byte lengths;
the persisted upload ID and storage's ListParts response support reconnects.
Only the server completes the exact contiguous manifest. A completed object
cannot be restarted, and processing independently verifies the whole SHA-256.
Derived JPEGs use conditional private PUTs. Playback uses short-lived signed GETs;
no public R2 URL or credentials are stored in client state.

Provision a dedicated bucket after enabling R2 in the Cloudflare dashboard:

```sh
npx wrangler@latest login
npx wrangler@latest r2 bucket create crrt-record-media
npx wrangler@latest r2 bucket cors set crrt-record-media --file artifacts/record-r2-cors.json
npx wrangler@latest r2 bucket lifecycle add crrt-record-media record-abort-incomplete --abort-multipart-days 1 --force
```

Create the CORS file with exact deployment origins (including the installed
extension ID), never `*`:

```json
{"rules":[{"allowed":{"origins":["https://your-dashboard.example","chrome-extension://YOUR_EXTENSION_ID"],"methods":["GET","HEAD","PUT"],"headers":["Content-Type","Content-Length","Range","If-None-Match"]},"exposeHeaders":["ETag","Content-Range","Accept-Ranges"],"maxAgeSeconds":3600}]}
```

Keep r2.dev and custom-domain public access disabled. The one-day lifecycle rule
aborts incomplete multipart sessions, including creations whose response was lost;
it must not expire committed recordings. Record's existing cleanup jobs abort
known sessions and delete committed objects under the recording's exact prefix.
Set the extension build's `WXT_RECORD_STORAGE_ORIGIN` to
`https://ACCOUNT_ID.r2.cloudflarestorage.com` so its host permissions cover direct
uploads. Rebuild/reload the extension when changing that origin.

Local S3 compatibility validation uses a private Docker RustFS bucket, not a
Cloudflare account. Start `rustfs/rustfs:1.0.4` as `record-r2-local` on network
`crrt-local`, port `127.0.0.1:43900:9000`, with local-only access key `record-local`
and secret `record-local-password`, then create `record-test` through the S3 API.
`bun scripts/record-local.ts r2-integration` exercises the same full lifecycle as
the Supabase integration, including multipart resume, private playback, worker
derivatives and cleanup. It never uses real Cloudflare credentials. Run a live
private-R2 smoke test as well before activation; an S3 emulator cannot establish
Cloudflare-specific signature, CORS or retention behavior.

## Remaining production integration gates

- Tomás reviews the transport contract and wires the adapter, public player and
  library. Incremental disk-backed chunk staging remains his recorder work.
- Approve hosted provider policy, user disclosures and actual Record allowance.
- Provision dedicated private storage and run a supervised worker with enough
  temporary disk, CPU and memory; add monitoring for failures/cleanup backlog.
  Verify the provider's expiration/cleanup policy for incomplete TUS/multipart
  sessions as well: the Record cleaner removes committed objects, while partial
  upload chunks remain the storage provider's responsibility.
- The one local Record migration is `0050_record_v1.sql`, following PR #350's
  Inbox restore and Cloud fence migrations. Reconcile again if trunk adds migrations
  before publishing.
- Run real Chrome capture/permission/navigation checks with the integrated
  frontend. The Docker suite validates backend synchronization, not browser capture.
