-- Episode recap ads: add new columns to feed_ads and create ad_events table
ALTER TABLE feed_ads ADD COLUMN IF NOT EXISTS episode_slug TEXT;
ALTER TABLE feed_ads ADD COLUMN IF NOT EXISTS episode_title TEXT;
ALTER TABLE feed_ads ADD COLUMN IF NOT EXISTS episode_tldl TEXT;
ALTER TABLE feed_ads ADD COLUMN IF NOT EXISTS episode_key_insights TEXT[];
ALTER TABLE feed_ads ADD COLUMN IF NOT EXISTS episode_quote TEXT;
ALTER TABLE feed_ads ADD COLUMN IF NOT EXISTS episode_quote_attribution TEXT;
ALTER TABLE feed_ads ADD COLUMN IF NOT EXISTS podcast_name TEXT;

CREATE TABLE IF NOT EXISTS ad_events (
  id SERIAL PRIMARY KEY,
  ad_id INTEGER NOT NULL,
  event_type TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ad_events_ad_id ON ad_events(ad_id);
CREATE INDEX IF NOT EXISTS idx_ad_events_created_at ON ad_events(created_at);
