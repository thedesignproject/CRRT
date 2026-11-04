# Resource Lighthouse checks

The selector runs on GitHub's `ubuntu-latest`; audit shards run on Blacksmith
4-vCPU Ubuntu runners:

- **Lighthouse · affected pages** compares the checked-out PR merge result with
  the PR base SHA. Pushes compare against the event's previous SHA.
- **lighthouse (mobile, shard 1/3)** and the other profile/shard checks audit the
  selected URLs, with three runs per URL and the existing median-based budgets.

Each profile uses up to three separate runners, limited to the number of affected
URLs. URLs are distributed evenly and occur exactly once per profile. Each
runner audits its assigned URLs sequentially so Chrome audits do not compete on
the same machine. A full 22-page audit uses 8/7/7 pages per profile: six audit
checks plus the selector. One affected URL uses two audit checks plus the selector.
Artifact names include the profile and shard number to avoid upload collisions.

The selector writes its URL list and reasons to the job summary. If no pages
are affected, both audit jobs are skipped before allocating runners. Workflow
path filters avoid starting this workflow for unrelated app/backend changes;
other CI workflows are independent.

## Selection rules

- Body-only resource content edits select the changed article URLs when the
  shared client catalog is unchanged.
- Catalog changes (including titles, ordering, additions/removals, and reading
  time) select all resource pages because every page loads that catalog.
- Library components and artwork select `/resources`.
- The shared article component and data reader select every article/tool page.
- Calculator components and calculations select the three tool pages.
- Shared styles, navigation, models, build tools, dependencies, workflow changes,
  and unclassified production inputs select all pages.
- Test-only and documentation-only edits select no pages.
- Known deployment helpers (Vercel output packaging, its build wrapper and
  verification, public-function packaging, and cloud preflight) select no pages.
  They are not used by the local static build audited by Lighthouse.
- `package.json` changes are compared structurally against the base. Formatting
  changes and edits limited to `vercel-build`, `now-build`, `deploy-build`,
  `cloud:check`, `db:migrate`, `test:coverage`, and `test:diff-coverage` select no
  pages. If another command references a changed alias in either revision, the
  selector audits everything. Dependency, toolchain, landing-build, unknown
  script, lockfile, and `vercel.json` changes still audit everything.

These rules deliberately follow shared modules, not only changed filenames.
When adding a dependency to a new surface, keep the selector's ownership rules
in sync; if ownership is uncertain, retain the full-audit fallback.

The selector reads resource literals without executing old revisions. Missing
history, invalid package metadata, or unsupported data syntax falls back to all current URLs. If the
selector job itself fails, the audit jobs still run with the audit script's
full-list default, while the selector check remains failed.

Use **Run workflow** for an unconditional full audit. There is no scheduled run.
