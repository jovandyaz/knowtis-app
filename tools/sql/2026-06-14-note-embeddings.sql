-- A3 hybrid retrieval. Apply MANUALLY to dev AND prod (Railway does not run
-- migrations). Run BEFORE deploying the API build that imports the schema.
CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE IF NOT EXISTS note_embeddings (
  note_id    uuid PRIMARY KEY REFERENCES notes(id) ON DELETE CASCADE,
  embedding  vector(1024) NOT NULL,
  model      text NOT NULL,
  input_hash text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- No HNSW index in v1: per-user accessible sets are small, so exact cosine KNN
-- is fast and 100%-recall. Add an HNSW index only when a single user's note
-- count grows large (vector dims must be <= 2000 for an HNSW index).
