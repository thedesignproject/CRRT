# Landing live demo and current product capabilities

Approved direction: replace the HOME hero CTA with Try CRRT, jump to a demo module below, and let visitors leave feedback using the real widget.

The hero visual stays intact. The demo follows the hero and explains selection, commenting and the per-tab scope. Its adapter persists at most 30 comments in sessionStorage, falls back to text-only persistence on screenshot quota errors, and keeps working in memory when storage is unavailable. No account or API is required; demo comments are not submitted to the team. The same adapter avoids backend errors on public docs.

MCP copy and setup describe the merged account-authorized Streamable HTTP service, explicit scopes and human review. Pricing adds MCP and labels Record agent handoff as private preview, inherited by Studio, with account-free recording/transcription distinguished from authenticated agent access. Prices and checkout logic stay intact.

Update foundations from trunk, then merge foundations into the landing branch so both previews contain the merged MCP and audited dependency versions. Preserve the draft state. Validate unit behavior, real-browser comment creation/reload/edit/delete, desktop/mobile layouts, build, typecheck, audit and each stack layer's diff coverage.
