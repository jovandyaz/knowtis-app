INSERT INTO feature_flags (key, enabled, description)
VALUES ('ai_auto_organize', false, 'Organization suggestions: bucket and tags proposed for a note, applied only by the user')
ON CONFLICT (key) DO NOTHING;
