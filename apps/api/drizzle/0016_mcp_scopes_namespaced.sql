-- Guard against double-prefixing so already-namespaced rows stay untouched.
UPDATE mcp_api_keys
SET scopes = 'notes:' || replace(scopes, ',', ',notes:')
WHERE scopes NOT LIKE 'notes:%';
--> statement-breakpoint
ALTER TABLE mcp_api_keys ALTER COLUMN scopes SET DEFAULT 'notes:read';
