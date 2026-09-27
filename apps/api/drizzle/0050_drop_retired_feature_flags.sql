-- Custom SQL migration file, put your code below! --
DELETE FROM feature_flags WHERE key IN (
  'voice_notes_enabled', 'agent_hybrid_retrieval', 'agent_web_search', 'agent_byok',
  'agent_longterm_memory', 'agent_injection_classifier', 'agent_history_injection_enforcement',
  'agent_scan_retrieved_notes', 'agent_prompt_caching', 'agent_health_alerts',
  'ai_cost_reserve', 'ai_byok_cost_gate', 'ai_global_spend_breaker', 'ai_anon_ip_budget',
  'ai_tier_gating', 'ai_catalog_sync', 'ai_auto_organize', 'email_verification_gate',
  'mcp_oauth'
);
