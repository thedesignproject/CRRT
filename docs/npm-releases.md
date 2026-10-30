# Publish the widget to npm

Merging to `trunk` deploys crrt.ai. Publishing `@thedesignproject/crrt` is a separate step.

1. Include the intended widget changes in a release PR. Update the root
   `package.json` version and `docs/CHANGELOG.md`; related changes can ship together.
2. Merge that PR after review and required checks pass.
3. When publishing is authorized, create and push the tag on that exact merge commit.
   Replace both values below. The version must match that commit's `package.json`.

```bash
release_version='0.3.23' # Example: replace with the release version.
release_commit='REPLACE_WITH_RELEASE_MERGE_COMMIT_SHA'
git fetch origin trunk --tags
git show "${release_commit}:package.json"
git merge-base --is-ancestor "$release_commit" origin/trunk &&
  git tag "v${release_version}" "$release_commit" &&
  git push origin "refs/tags/v${release_version}"
```

Do not overwrite an existing tag. Pushing the tag triggers `.github/workflows/publish.yml`.
A local tag alone does not publish anything.

4. Confirm that the matching publish run succeeds and npm shows the new version:

```bash
gh run list --workflow=publish.yml --commit "$release_commit" --limit 3
npm view "@thedesignproject/crrt@${release_version}" version
npm view @thedesignproject/crrt dist-tags.latest
```

Only then report it as released. Customers still need to update the dependency and redeploy.
