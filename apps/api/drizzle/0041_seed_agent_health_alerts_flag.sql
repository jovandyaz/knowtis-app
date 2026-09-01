INSERT INTO feature_flags (key, enabled, description)
VALUES ('agent_health_alerts', false, 'Daily agent health report: alerts on tool error rate and anomalous stop reasons via AI_ALERT_WEBHOOK_URL')
ON CONFLICT (key) DO NOTHING;
