PRAGMA foreign_keys=ON;
CREATE TABLE IF NOT EXISTS event_syntheses(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  scope TEXT NOT NULL CHECK(scope IN ('NEWS','EVENT','MARKET')),
  event_id INTEGER REFERENCES events(id) ON DELETE CASCADE,
  query_json TEXT NOT NULL DEFAULT '{}',
  input_hash TEXT NOT NULL,
  model TEXT NOT NULL,
  headline TEXT NOT NULL,
  overview TEXT,
  market_tone TEXT NOT NULL,
  confidence INTEGER NOT NULL DEFAULT 0,
  themes_json TEXT NOT NULL DEFAULT '[]',
  watch_json TEXT NOT NULL DEFAULT '[]',
  limitations_json TEXT NOT NULL DEFAULT '[]',
  evidence_count INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_event_syntheses_event ON event_syntheses(event_id,created_at DESC);
CREATE INDEX IF NOT EXISTS idx_event_syntheses_scope ON event_syntheses(scope,created_at DESC);
CREATE INDEX IF NOT EXISTS idx_event_syntheses_hash ON event_syntheses(input_hash,created_at DESC);
