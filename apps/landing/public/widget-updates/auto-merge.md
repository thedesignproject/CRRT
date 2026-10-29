# Optional patch auto-merge

Use only with explicit customer authorization. For an existing Renovate setup, use its native package-specific patch auto-merge policy and retain its checks/review requirements; do not install a second bot.

For Dependabot:

1. Verify the repository allows auto-merge and squash merges. Its default branch must have a branch protection rule with named required status checks. The template deliberately refuses ruleset-only protection it cannot verify; retain manual review in that case. Do not remove required reviews, bypass protection, or grant bot approval on the customer's behalf.
2. Adapt [assets/patch-auto-merge.yml](assets/patch-auto-merge.yml) into `.github/workflows/crrt-patch-auto-merge.yml`, preserving existing automation. It uses trusted base-branch code and never checks out or runs PR code. Keep action versions pinned.
3. After authorized installation, set the repository Actions variable `CRRT_AUTO_UPDATE_PATCHES` to `true`. Leaving it unset keeps the workflow off. Required reviewers still have to approve if repository policy requires them.
4. Observe a real CRRT-only patch PR: CI must run, auto-merge must wait for required checks/reviews, and the normal deployment must run after merge. Do not claim hands-off delivery before verifying this. No eligible PR yet means verification is pending.

To stop future automatic merges, unset the variable. Also disable any already-queued auto-merge requests on open CRRT PRs. Update PRs continue normally.

A patch version is not proof of compatibility. Failed checks leave the PR open. API or permission errors also leave it for manual review; do not add a personal access token or weaken protections to work around them.
