PRAGMA foreign_keys=ON;
CREATE TABLE IF NOT EXISTS event_assets(
  event_id INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  asset TEXT NOT NULL,
  relevance REAL NOT NULL DEFAULT 50,
  direction TEXT NOT NULL DEFAULT 'UNKNOWN' CHECK(direction IN ('POSITIVE','NEGATIVE','NEUTRAL','MIXED','UNKNOWN')),
  expected_impact REAL NOT NULL DEFAULT 0,
  PRIMARY KEY(event_id,asset)
);
CREATE INDEX IF NOT EXISTS idx_event_assets_asset ON event_assets(asset,event_id);
