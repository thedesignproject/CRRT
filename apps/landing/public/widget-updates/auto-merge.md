# Optional patch auto-merge

Use only with explicit customer authorization. For an existing Renovate setup, use its native package-specific patch auto-merge policy and retain its checks/review requirements; do not install a second bot.

For Dependabot:

1. Verify the repository allows auto-merge and squash merges. Its default branch must have a branch protection rule with named required status checks. The template deliberately refuses ruleset-only protection it cannot verify; retain manual review in that case. Do not remove required reviews, bypass protection, or grant bot approval on the customer's behalf.
2. Adapt [assets/patch-auto-merge.yml](assets/patch-auto-merge.yml) into `.github/workflows/crrt-patch-auto-merge.yml`, preserving existing automation. It uses trusted base-branch code and never checks out or runs PR code. Keep action versions pinned.
3. Before enabling auto-merge, verify that the deployment trigger supports merges performed using this workflow's `GITHUB_TOKEN`. GitHub Actions workflows triggered by `push` or `pull_request: closed` can be suppressed by that token; see [GitHub's workflow trigger documentation](https://docs.github.com/en/actions/how-tos/write-workflows/choose-when-workflows-run/trigger-a-workflow). For those deployments, or when compatibility is unverified, keep manual merging and leave `CRRT_AUTO_UPDATE_PATCHES` unset unless an authorized, working deployment trigger has been configured.
4. After authorized installation and the deployment compatibility check, set the repository Actions variable `CRRT_AUTO_UPDATE_PATCHES` to `true`. Leaving it unset keeps the workflow off. Required reviewers still have to approve if repository policy requires them.
5. Observe a real CRRT-only patch PR: CI must run, auto-merge must wait for required checks/reviews, and the normal deployment must run after merge. Do not claim hands-off delivery before verifying this. No eligible PR yet means verification is pending. If the deployment does not run, unset `CRRT_AUTO_UPDATE_PATCHES`, disable any queued auto-merge requests, and retain manual merging until the deployment trigger is fixed and verified.

To stop future automatic merges, unset the variable. Also disable any already-queued auto-merge requests on open CRRT PRs. Update PRs continue normally.

A patch version is not proof of compatibility. Failed checks leave the PR open. API or permission errors also leave it for manual review; do not add a personal access token or weaken protections to work around them.
