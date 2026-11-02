---
name: widget-updates
description: Configure scheduled CRRT npm widget updates in a customer's GitHub repository when they request automatic maintenance. Does not update the hosted MCP server.
---

# Keep the CRRT widget updated

Set up dependency updates in the **consumer repository**, not the CRRT publisher. Default: scheduled update PRs with human review. This skill is setup guidance; Dependabot or the existing dependency bot runs the schedule after setup.

1. Find `@thedesignproject/crrt` in the actual package manifest and lockfile. Identify the workspace root, package manager, GitHub repository, default branch, existing dependency bot, CI checks, and deployment trigger. If CRRT is not an npm dependency, stop: this setup does not apply. Do not install CRRT or change the integration merely to enable updates.
2. Reuse existing Dependabot or Renovate configuration. Preserve unrelated dependencies, registries, schedules, groups, and ignore rules. Never replace a whole configuration or add overlapping ecosystem/directory entries. If existing policy excludes CRRT, explain the conflict before changing that policy.
3. With no existing bot, adapt [assets/dependabot.yml](assets/dependabot.yml) into `.github/dependabot.yml`. Set the directory to the supported manifest/lockfile root; verify the package manager and lockfile are supported in the [Dependabot reference](https://docs.github.com/en/code-security/reference/supply-chain-security/dependabot-options-reference). Do not convert lockfiles. With an existing bot, add CRRT to its policy without narrowing updates for other packages. Preserve its schedule unless changing it was requested.
4. Check that dependency PRs actually run the project's tests and build, and that merging an update triggers its normal deployment. Do not add secrets to bot workflows or weaken branch protection to get checks passing. If CI or deployment is absent, explain what remains manual. Open a setup PR; follow the user's existing authorization for publishing and merging.
5. After setup reaches the default branch, inspect the dependency bot's update logs and first PR/checks. Report separately: configuration prepared, schedule active, update merged, deployment verified. Never call a package updated merely because the setup PR exists.

New Dependabot setups check on weekdays (`daily`), opening a PR only when an update is available. They do not update running pages immediately after CRRT publishes. Existing installs need this one-time setup; a skill cannot retrofit it remotely.

## Optional patch auto-merge

Only when the customer explicitly requests it, read [auto-merge.md](auto-merge.md). Otherwise keep human review. Minor and major releases always stay manual with the supplied template.

## Report to the customer

State the repository, package path, schedule, review mode, CI/deployment status, and any remaining action. Do not ask them to update the package manually when the configured bot can create the update PR.
