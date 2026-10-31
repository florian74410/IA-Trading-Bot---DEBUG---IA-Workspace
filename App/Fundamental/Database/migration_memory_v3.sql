-- IA-TB Fundamental Engine V3 - temporal memory / event timeline
CREATE TABLE IF NOT EXISTS event_timeline (
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 event_id INTEGER NOT NULL,
 raw_item_id INTEGER,
 synthesis_id INTEGER,
 entry_type TEXT NOT NULL CHECK(entry_type IN ('EVIDENCE','STATE','SYNTHESIS','MILESTONE')),
 occurred_at TEXT NOT NULL,
 title TEXT,
 summary TEXT,
 source_code TEXT,
 novelty_score REAL NOT NULL DEFAULT 0,
 fingerprint TEXT NOT NULL,
 payload_json TEXT,
 created_at TEXT NOT NULL,
 FOREIGN KEY(event_id) REFERENCES events(id) ON DELETE CASCADE,
 FOREIGN KEY(raw_item_id) REFERENCES raw_items(id) ON DELETE SET NULL,
 FOREIGN KEY(synthesis_id) REFERENCES event_syntheses(id) ON DELETE SET NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS ux_event_timeline_fingerprint ON event_timeline(event_id,fingerprint);
CREATE INDEX IF NOT EXISTS ix_event_timeline_event_time ON event_timeline(event_id,occurred_at DESC);
CREATE INDEX IF NOT EXISTS ix_event_timeline_novelty ON event_timeline(event_id,novelty_score DESC,occurred_at DESC);
