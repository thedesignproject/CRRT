# Resolving a pending tracker export

An uncertain GitHub, Linear, or Jira export blocks privacy restrictions and membership changes until its result is resolved. A timeout does not prove the provider received nothing.

A project admin can retry sending to surface the pending-export message, check the tracker for an existing issue, acknowledge that check, and select **Resolve pending export**. Resolution releases the abandoned export without creating or deleting an external issue. Check for an existing issue before sending again. An active export returns a conflict and cannot be resolved.

The equivalent authenticated API is `POST /api/v1/comments/:commentId/external-work-recovery` with `{ "provider": "github" | "linear" | "jira", "confirmCheckedTracker": true }`. It requires current project-admin access and returns 409 while any sender for that project is active. A canceled sender lease cannot be used to restart an export.

The API requires the server-only `DATABASE_URL` already used by Drizzle, using the direct PostgreSQL connection documented in `db/DRIZZLE-GUIDE.md`. A dedicated transaction holds a shared advisory lock through preparation, dispatch, and checkpointing; recovery obtains its exclusive counterpart. Supabase remains the data query layer. If coordination is unavailable, tracker sending fails closed. Connection loss aborts AI and issue-creation requests.
