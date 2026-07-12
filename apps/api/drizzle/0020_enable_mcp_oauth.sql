-- Enable the MCP OAuth authorization server by default in every environment.
-- Force-enables existing rows (seeded false by 0017) and inserts true for
-- brand-new environments where 0017 has not yet run.
INSERT INTO feature_flags (key, enabled, description)
VALUES ('mcp_oauth', true, 'OAuth 2.1 authorization server for MCP clients')
ON CONFLICT (key) DO UPDATE SET enabled = true, updated_at = now();
