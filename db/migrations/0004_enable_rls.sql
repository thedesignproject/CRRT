-- Enable Row Level Security on every remaining public table.
--
-- The Supabase publishable (anon) key is shipped in the dashboard bundle by
-- design; Supabase's model assumes RLS guards every table. Until now only
-- `notifications` had RLS (migration 0002), so anyone could take the bundled
-- key and read/write/delete the other tables directly via the Supabase REST
-- API, bypassing the app-layer authorization in `api/`.
--
-- Enabling RLS with NO permissive policy = deny-all for the `anon` and
-- `authenticated` roles. The API talks to these tables through the
-- service-role client (`getServiceSupabase`), which bypasses RLS, and does its
-- own authorization. FORCE also subjects the table owner to RLS.
--
-- `notifications` is intentionally omitted: it already has RLS + a
-- `notifications_select_own` policy so the dashboard can subscribe to its own
-- rows over realtime with the authenticated key.

ALTER TABLE "comments" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "comments" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "projects" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "projects" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "project_members" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "project_members" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "project_invites" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "project_invites" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "project_repo_configs" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "project_repo_configs" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "feedback_shares" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "feedback_shares" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "feedback_share_items" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "feedback_share_items" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "feedback_events" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "feedback_events" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "agent_presence" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "agent_presence" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "feedback_operation_keys" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "feedback_operation_keys" FORCE ROW LEVEL SECURITY;
