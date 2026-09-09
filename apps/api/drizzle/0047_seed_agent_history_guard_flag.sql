INSERT INTO feature_flags (key, enabled, description) VALUES
('agent_history_injection_enforcement', false, 'Drop unsafe replayed assistant and tool history')
ON CONFLICT (key) DO NOTHING;
