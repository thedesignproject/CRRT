# Use Supabase secret keys without Bearer auth

- Route opaque Supabase secret keys through `apikey` without allowing the client library to add a Bearer token
- Preserve legacy JWT compatibility for local Supabase and support the old environment variable during cutover
- Update local Docker setup and documentation to expose and use the generated `sb_secret_*` key
- Cover the key-format, fallback, Auth Admin, database, and storage paths with tests
