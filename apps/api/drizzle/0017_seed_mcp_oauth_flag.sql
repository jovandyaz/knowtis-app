INSERT INTO feature_flags (key, enabled, description)
VALUES ('mcp_oauth', false, 'OAuth 2.1 authorization server for MCP clients')
ON CONFLICT (key) DO NOTHING;
