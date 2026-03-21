ALTER TABLE affiliate_clicks ADD COLUMN IF NOT EXISTS user_id integer;

CREATE TABLE IF NOT EXISTS feature_events (
  id serial PRIMARY KEY,
  user_id integer,
  feature text NOT NULL CHECK (feature IN ('ai_chat', 'episode_link', 'spotify_import')),
  metadata jsonb NOT NULL DEFAULT '{}',
  created_at timestamp DEFAULT now() NOT NULL
);
