INSERT INTO feature_flags (key, enabled, description)
VALUES ('agent_transcript_tools', false, 'Copilot persists and replays tool calls and results in the conversation transcript')
ON CONFLICT (key) DO NOTHING;
