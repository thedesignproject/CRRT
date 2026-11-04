# Resource Lighthouse checks

`resources-quality.yml` exposes three checks:

- **Lighthouse · affected pages** compares the checked-out PR merge result with
  the PR base SHA. Pushes compare against the event's previous SHA.
- **lighthouse (mobile)** and **lighthouse (desktop)** audit the selected URLs,
  with three runs per URL and the existing median-based budgets.

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

These rules deliberately follow shared modules, not only changed filenames.
When adding a dependency to a new surface, keep the selector's ownership rules
in sync; if ownership is uncertain, retain the full-audit fallback.

The selector reads resource literals without executing old revisions. Missing
history or unsupported data syntax falls back to all current URLs. If the
selector job itself fails, the audit jobs still run with the audit script's
full-list default, while the selector check remains failed.

Use **Run workflow** for an unconditional full audit. There is no scheduled run.
