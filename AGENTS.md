# Agent instructions

Read only the guides relevant to the task:

- Always: [engineering rules](rules/engineering.md).
- UI: [UX rules](rules/ux.md), then [design direction](brain/design/DIRECTION.md) and [foundations](brain/design/foundations/). Build with `packages/ui` (`@crrt/ui`, tokens in `src/tokens/tokens.css`), never raw hex. `branding/CRRT-DESIGN-SYSTEM.md` is legacy.
- Data or APIs: [security rules](rules/security.md). For schema changes, also read the [database guide](db/DRIZZLE-GUIDE.md).
- Product or copy: [business rules](rules/business.md).
- After code changes: run the [diff coverage checks](.agents/skills/diff-coverage/SKILL.md).

## Ship widget changes to npm

Changes affecting the published widget need an npm release, not just a merge.
Related PRs can share one release; dashboard/backend/landing-only changes do not need one.

Update the version and changelog, merge the release PR, then **create and push its tag**.
Follow [the release commands](docs/npm-releases.md). Only call it released after npm
shows the new version. Customers must update their dependency and redeploy.

## Customer widget updates

When installing or updating CRRT in a customer project, check the installed npm version against the latest published release. Apply compatible updates within the authorized scope and run the project's relevant checks. For scheduled updates, follow the [widget update skill](apps/landing/public/widget-updates/SKILL.md): reuse existing automation, keep human review by default, and enable patch auto-merge only when explicitly requested. These instructions do not run a background schedule by themselves.
