CREATE TABLE "mcp_dashboard_operations" (
	"connection_id" uuid NOT NULL,
	"request_key" text NOT NULL,
	"request_hash" text NOT NULL,
	"response" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "mcp_dashboard_operations_connection_id_request_key_pk" PRIMARY KEY("connection_id","request_key"),
	CONSTRAINT "mcp_dashboard_operations_shape" CHECK ("mcp_dashboard_operations"."request_key" ~ '^[A-Za-z0-9_-]{16,128}$' and "mcp_dashboard_operations"."request_hash" ~ '^[0-9a-f]{64}$')
);
--> statement-breakpoint
ALTER TABLE "mcp_dashboard_operations" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "mcp_permission_upgrades" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"connection_id" uuid NOT NULL,
	"bundle" text DEFAULT 'dashboard-v1' NOT NULL,
	"state" text DEFAULT 'pending' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone DEFAULT now() + interval '10 minutes' NOT NULL,
	"decided_at" timestamp with time zone,
	CONSTRAINT "mcp_permission_upgrades_bundle" CHECK ("mcp_permission_upgrades"."bundle" = 'dashboard-v1'),
	CONSTRAINT "mcp_permission_upgrades_state" CHECK ("mcp_permission_upgrades"."state" in ('pending','approved','declined')),
	CONSTRAINT "mcp_permission_upgrades_lifetime" CHECK ("mcp_permission_upgrades"."expires_at" > "mcp_permission_upgrades"."created_at" and "mcp_permission_upgrades"."expires_at" <= "mcp_permission_upgrades"."created_at" + interval '10 minutes')
);
--> statement-breakpoint
ALTER TABLE "mcp_permission_upgrades" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "mcp_codes" DROP CONSTRAINT "mcp_codes_scope";--> statement-breakpoint
ALTER TABLE "mcp_connections" DROP CONSTRAINT "mcp_connections_scope";--> statement-breakpoint
ALTER TABLE "mcp_dashboard_operations" ADD CONSTRAINT "mcp_dashboard_operations_connection_id_mcp_connections_id_fk" FOREIGN KEY ("connection_id") REFERENCES "public"."mcp_connections"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mcp_permission_upgrades" ADD CONSTRAINT "mcp_permission_upgrades_connection_id_mcp_connections_id_fk" FOREIGN KEY ("connection_id") REFERENCES "public"."mcp_connections"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "mcp_permission_upgrades_connection" ON "mcp_permission_upgrades" USING btree ("connection_id");--> statement-breakpoint
ALTER TABLE "mcp_codes" ADD CONSTRAINT "mcp_codes_scope" CHECK ("mcp_codes"."scope" in ('crrt:read','crrt:read crrt:implement','crrt:read crrt:review','crrt:read crrt:implement crrt:review','crrt:read crrt:implement crrt:review crrt:dashboard'));--> statement-breakpoint
ALTER TABLE "mcp_connections" ADD CONSTRAINT "mcp_connections_scope" CHECK ("mcp_connections"."scope" in ('crrt:read','crrt:read crrt:implement','crrt:read crrt:review','crrt:read crrt:implement crrt:review','crrt:read crrt:implement crrt:review crrt:dashboard'));
--> statement-breakpoint
CREATE FUNCTION public.mcp_request_dashboard_upgrade(p_connection uuid,p_actor uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE request public.mcp_permission_upgrades;
BEGIN
  PERFORM public.mcp_require_connection(p_connection,p_actor,'crrt:read');
  PERFORM pg_advisory_xact_lock(hashtextextended('crrt-mcp-upgrade:'||p_connection::text,0));
  SELECT * INTO request FROM public.mcp_permission_upgrades WHERE connection_id=p_connection
    AND state='pending' AND expires_at>clock_timestamp() ORDER BY created_at DESC LIMIT 1;
  IF NOT FOUND THEN
    INSERT INTO public.mcp_permission_upgrades(connection_id) VALUES(p_connection) RETURNING * INTO request;
  END IF;
  RETURN to_jsonb(request);
END;
$$;
--> statement-breakpoint
CREATE FUNCTION public.mcp_decide_dashboard_upgrade(p_request uuid,p_actor uuid,p_decision text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE request public.mcp_permission_upgrades; connection public.mcp_connections; client_name text;
BEGIN
  IF p_decision NOT IN ('inspect','approve','deny') THEN RAISE EXCEPTION 'invalid_decision'; END IF;
  -- Lock the connection first, matching revocation and credential refresh.
  SELECT c.* INTO connection FROM public.mcp_connections c JOIN public.mcp_permission_upgrades r ON r.connection_id=c.id
    WHERE r.id=p_request AND c.user_id=p_actor FOR UPDATE OF c;
  IF NOT FOUND THEN RAISE EXCEPTION 'upgrade_unavailable'; END IF;
  PERFORM public.mcp_require_connection(connection.id,p_actor,'crrt:read');
  SELECT * INTO request FROM public.mcp_permission_upgrades WHERE id=p_request FOR UPDATE;
  SELECT name INTO client_name FROM public.mcp_clients WHERE id=connection.client_id;
  IF request.state='pending' AND request.expires_at<=clock_timestamp() THEN
    RETURN jsonb_build_object('state','expired','name',client_name,'bundle',request.bundle);
  END IF;
  IF request.state='pending' AND p_decision<>'inspect' THEN
    IF p_decision='approve' THEN
      UPDATE public.mcp_connections SET scope='crrt:read crrt:implement crrt:review crrt:dashboard' WHERE id=connection.id;
    END IF;
    UPDATE public.mcp_permission_upgrades SET state=CASE WHEN p_decision='approve' THEN 'approved' ELSE 'declined' END,
      decided_at=clock_timestamp() WHERE id=request.id RETURNING * INTO request;
  END IF;
  RETURN jsonb_build_object('state',request.state,'name',client_name,'bundle',request.bundle,'expiresAt',request.expires_at);
END;
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION public.mcp_request_dashboard_upgrade(uuid,uuid),public.mcp_decide_dashboard_upgrade(uuid,uuid,text) FROM PUBLIC,anon,authenticated;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.mcp_request_dashboard_upgrade(uuid,uuid),public.mcp_decide_dashboard_upgrade(uuid,uuid,text) TO service_role;
--> statement-breakpoint
GRANT ALL ON public.mcp_permission_upgrades TO service_role;
--> statement-breakpoint
NOTIFY pgrst,'reload schema';
--> statement-breakpoint
GRANT ALL ON public.mcp_dashboard_operations TO service_role;
