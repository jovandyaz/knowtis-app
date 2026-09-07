INSERT INTO feature_flags (key, enabled, description)
VALUES ('study_review_queue', false, 'Cross-deck "Repasar hoy" queue: /study route, dashboard card and navigation badge')
ON CONFLICT (key) DO NOTHING;
