# Agent instructions

Read only the guides relevant to the task:

- Always: [engineering rules](rules/engineering.md).
- UI: [UX rules](rules/ux.md) and [design system](branding/CRRT-DESIGN-SYSTEM.md).
- Data or APIs: [security rules](rules/security.md). For schema changes, also read the [database guide](db/DRIZZLE-GUIDE.md).
- Product or copy: [business rules](rules/business.md).
- After code changes: run the [diff coverage checks](.agents/skills/diff-coverage/SKILL.md).

## Ship widget changes to npm

Changes affecting the published widget need an npm release, not just a merge.
Related PRs can share one release; dashboard/backend/landing-only changes do not need one.

Update the version and changelog, merge the release PR, then **create and push its tag**.
Follow [the release commands](docs/npm-releases.md). Only call it released after npm
shows the new version. Customers must update their dependency and redeploy.
