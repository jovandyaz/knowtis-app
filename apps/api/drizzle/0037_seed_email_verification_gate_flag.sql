INSERT INTO feature_flags (key, enabled, description)
VALUES ('email_verification_gate', false, 'Require a verified email for sharing, MCP keys and BYOK')
ON CONFLICT (key) DO NOTHING;
