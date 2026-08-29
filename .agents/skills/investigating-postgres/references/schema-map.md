# Schema map

Canonical source: `apps/api/src/database/schema/` in the knowtis repo (16 schema files + `index.ts`). Always read the actual file before querying — this map only says where to look.

| Table (schema file) | Holds |
| --- | --- |
| `users.schema.ts` | Accounts (email, password hash, profile) |
| `sessions.schema.ts` | Refresh-token families (SHA-256 hashes, rotation/revocation state) |
| `notes.schema.ts` | Notes: title, content, `yjs_state` (CRDT buffer), owner, general access level |
| `note-images.schema.ts` | Uploaded note images |
| `note-embeddings.schema.ts` | pgvector embeddings for hybrid retrieval (reconciled by cron) |
| `conversations.schema.ts` | Copilot threads + messages (server-authoritative history) |
| `user-memories.schema.ts` | Long-term memory facts (userId-scoped, Mem0-style) |
| `ai-config.schema.ts` | System AI model configuration |
| `user-ai-settings.schema.ts` | Per-account model selection |
| `user-provider-keys.schema.ts` | BYOK keys (AES-256-GCM encrypted — never decryptable via SQL) |
| `ai-usage.schema.ts` | Per-turn usage/billing rows (`byok` flag marks user-billed turns) |
| `feature-flags.schema.ts` | DB feature flags (`ai_enabled`, `agent_byok`, `agent_web_search`, …) |
| `artifacts.schema.ts` | Generated artifacts |
| `mcp-api-keys.schema.ts` | MCP API keys (hashed) |
| `email-verification-tokens.schema.ts` / `password-reset-tokens.schema.ts` | Auth flow tokens |

Note permissions/sharing tables are defined alongside notes — check `notes.schema.ts` and `index.ts` exports for the exact permission table names before joining.

## Useful join spine

`users` ←(owner)– `notes` –(note_id)→ note permissions / embeddings / images; `users` ← `conversations` ← messages; `users` ← `ai_usage`.
