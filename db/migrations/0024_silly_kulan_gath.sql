CREATE TABLE "extension_auth_clients" (
	"extension_id" text PRIMARY KEY NOT NULL,
	"redirect_uri" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "extension_auth_clients_redirect_uri_unique" UNIQUE("redirect_uri"),
	CONSTRAINT "extension_auth_clients_extension_id_check" CHECK ("extension_auth_clients"."extension_id" ~ '^[a-p]{32}$'),
	CONSTRAINT "extension_auth_clients_redirect_uri_check" CHECK ("extension_auth_clients"."redirect_uri" = 'https://' || "extension_auth_clients"."extension_id" || '.chromiumapp.org/crrt-auth')
);
--> statement-breakpoint
ALTER TABLE "extension_auth_clients" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "extension_auth_handoffs" ADD CONSTRAINT "extension_auth_handoffs_extension_id_extension_auth_clients_extension_id_fk" FOREIGN KEY ("extension_id") REFERENCES "public"."extension_auth_clients"("extension_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "extension_auth_handoffs" ADD CONSTRAINT "extension_auth_handoffs_max_lifetime_check" CHECK ("extension_auth_handoffs"."expires_at" <= "extension_auth_handoffs"."created_at" + interval '5 minutes');