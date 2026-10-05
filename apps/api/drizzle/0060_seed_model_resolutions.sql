INSERT INTO "ai_model_resolutions" ("selector_key", "active_model_id") VALUES
  ('platform.balanced', 'openrouter:deepseek/deepseek-v3.2'),
  ('platform.fast', 'openrouter:minimax/minimax-m2.5'),
  ('platform.powerful', 'openrouter:moonshotai/kimi-k2.5')
ON CONFLICT ("selector_key") DO NOTHING;
