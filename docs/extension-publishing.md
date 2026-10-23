# Chrome Web Store releases

The extension has its own version in `apps/extension/package.json`. Neither the
root npm package version nor `packages/crrt-storybook/package.json` controls it.
Only `extension-v*` tags submit an extension release. The npm packages keep their
existing `v*` and `crrt-storybook-v*` release triggers.

## One-time setup

The Chrome Web Store publisher must link
`crrt-service@crrt-512315.iam.gserviceaccount.com` under Account → Service account.
This has been configured for publisher `ca1d74b5-f59b-4c6a-8a37-af60ce24d29f` and
extension `kckiejblkmbmdappaofepmbnpbejomon`.

1. Enable the Chrome Web Store API in Google Cloud project `crrt-512315`.
2. Create a JSON key for the linked service account. Save the entire unchanged
   JSON as repository Actions secret `CWS_SERVICE_ACCOUNT_KEY`. Never commit it.
   Rotate the key in Google Cloud and replace this secret when needed.
3. Configure these repository Actions variables:

   | Variable | Value |
   | --- | --- |
   | `CWS_PUBLISHER_ID` | `ca1d74b5-f59b-4c6a-8a37-af60ce24d29f` |
   | `CWS_EXTENSION_ID` | `kckiejblkmbmdappaofepmbnpbejomon` |
   | `CWS_SERVICE_ACCOUNT` | `crrt-service@crrt-512315.iam.gserviceaccount.com` |
   | `CRRT_SUPABASE_URL` | Production Supabase project origin |

4. Set Actions secret `CRRT_SUPABASE_ANON_KEY` to the production Supabase
   **publishable or anon key**. It is bundled into the extension; never use a
   service-role or secret key. These Supabase settings are required by the
   existing package builder, independently of publishing authentication.
5. Merge the workflow into `trunk`, then run **Extension package → Run workflow**
   on `trunk` with **check_store_access** selected (the default). This checks
   authentication and reports store status without building, uploading, or
   submitting anything. Uncheck it to build an artifact without publishing.

The key is available only in the store jobs, which run on extension tag pushes,
manually dispatched checks on `trunk` or `feat/chrome-store-publishing`, or manual cancellations on `trunk`.
Pull request builds cannot use those jobs. Authentication signs an RS256 JWT in memory using Node's built-in crypto library,
exchanges it directly with Google's OAuth endpoint for a temporary token with
the Chrome Web Store scope, and masks that token in Actions logs. It does not
write the JSON key to disk. No federation or service account impersonation IAM
roles are needed. Store operations are serialized across versions.

Before merging, the existing packaging workflow can be dispatched from the
publishing feature branch for a read-only authentication check:

```bash
gh workflow run extension-package.yml \
  --repo thedesignproject/CRRT \
  --ref feat/chrome-store-publishing \
  --field check_store_access=true
```

This skips the package job and executes only authentication and `fetchStatus`.
Find and watch its run with `gh run list --repo thedesignproject/CRRT --workflow
extension-package.yml --branch feat/chrome-store-publishing --event
workflow_dispatch`, then `gh run watch RUN_ID --repo thedesignproject/CRRT
--exit-status`. The feature branch exception does not enable cancellation or
publishing from branch pushes.

## Release

1. Increment only `apps/extension/package.json` (for example `1.0.0` → `1.0.1`),
   commit the change, and merge it into `trunk` through the normal review flow.
2. Pull `trunk`, then create and push the matching tag:

   ```bash
   git switch trunk
   git pull --ff-only origin trunk
   git tag extension-v1.0.1
   git push origin extension-v1.0.1
   ```

The workflow rejects mismatched tags, non-Chrome version syntax, and release
commits outside `trunk`. It tests and builds the extension, validates its packaged
contents, and verifies the deterministic ZIP. The store job verifies the build's
commit, ZIP checksum, manifest checksum, and version, then queries all published
and submitted distribution channels. Equal or older versions fail before upload.
Numeric comparison treats `1.0.0` and `1.0.0.0` as the same version.

Upload processing must finish successfully before submission. Failed, unknown,
and timed-out upload states stop the job. Submission blocks on store warnings
and publishes automatically after Google's review approval. A successful CI
submission does not mean the release is already live.

The job does not automatically bump versions, replace tags, skip review, or
cancel pending submissions. If a request fails after upload or submission,
inspect the dashboard before retrying. A version already submitted or published
will be refused on rerun; prepare a newer version for the next release.

## Cancel a pending review with GitHub CLI

After `.github/workflows/extension-cancel-review.yml` is merged into `trunk`,
an authenticated GitHub user or agent with repository write access can dispatch
the **Chrome Web Store cancel review** workflow. It uses the existing service
account secret; no Chrome Web Store dashboard access is needed.

To cancel version `1.0.1` currently under review:

```bash
gh workflow run extension-cancel-review.yml \
  --repo thedesignproject/CRRT \
  --ref trunk \
  --field version=1.0.1
```

Dispatching only queues the operation. Find the run whose title includes the
requested version and initiating GitHub user, then watch its numeric ID:

```bash
gh run list \
  --repo thedesignproject/CRRT \
  --workflow extension-cancel-review.yml \
  --event workflow_dispatch \
  --limit 10 \
  --json databaseId,displayTitle,status,conclusion,url

gh run watch RUN_ID --repo thedesignproject/CRRT --exit-status
gh run view RUN_ID --repo thedesignproject/CRRT
```

Replace `RUN_ID` with the selected run's `databaseId`. If it fails, inspect the
failed step with:

```bash
gh run view RUN_ID --repo thedesignproject/CRRT --log-failed
```

The cancellation runs only on `trunk` and uses the same concurrency group as
publishing, so those store jobs do not overlap. It checks that a submission is
still `PENDING_REVIEW` and that every submitted channel matches the supplied
version, calls Google's `cancelSubmission` endpoint, then fetches the resulting
status. A successful run records cancellation and the final status in its job
summary. Missing reviews, different versions, API errors, and unconfirmed
cancellations fail the run. Already published versions cannot be cancelled.
The action does not upload or submit a replacement.

After cancellation succeeds, merge the replacement changes with an incremented
extension version (for example `1.0.2`) and push `extension-v1.0.2` through the
normal release flow. Agents should check the cancellation run's conclusion
before proceeding with that replacement release.

The same action is available in GitHub's UI under **Actions → Chrome Web Store
cancel review → Run workflow**: select `trunk`, enter the pending version, and
run it.

## Local verification

```bash
python3 -m unittest discover -s scripts -p 'test_chrome_store.py' -v
node --test scripts/chrome-store-auth.test.mjs
```

References: [Chrome service accounts](https://developer.chrome.com/docs/webstore/service-accounts),
[Google service account OAuth](https://developers.google.com/identity/protocols/oauth2/service-account),
[Chrome API v2](https://developer.chrome.com/docs/webstore/using-api).
