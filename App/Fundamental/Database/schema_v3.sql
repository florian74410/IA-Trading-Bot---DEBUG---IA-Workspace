PRAGMA foreign_keys=ON;
PRAGMA journal_mode=WAL;
PRAGMA synchronous=NORMAL;
PRAGMA busy_timeout=5000;

CREATE TABLE IF NOT EXISTS schema_migrations(
  version INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  applied_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS settings(
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS sources(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  source_type TEXT NOT NULL CHECK(source_type IN ('OFFICIAL','DATA_PROVIDER','MEDIA','ANALYTICS','SECURITY','PUBLIC_FIGURE','FORECAST')),
  country TEXT,
  priority TEXT NOT NULL CHECK(priority IN ('P1','P2','P3')),
  grade TEXT NOT NULL CHECK(grade IN ('A+','A','B','C','D','E')),
  reliability_base INTEGER NOT NULL CHECK(reliability_base BETWEEN 0 AND 100),
  speed_base INTEGER NOT NULL CHECK(speed_base BETWEEN 0 AND 100),
  independence_group TEXT NOT NULL,
  homepage_url TEXT,
  enabled INTEGER NOT NULL DEFAULT 1 CHECK(enabled IN (0,1)),
  notes TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS source_domains(
  source_id INTEGER NOT NULL REFERENCES sources(id) ON DELETE CASCADE,
  domain TEXT NOT NULL CHECK(domain IN ('MACRO','MONETARY','MARKET_RISK','REGULATION','CRYPTO_NETWORK','ADOPTION','SECURITY')),
  competence INTEGER NOT NULL CHECK(competence BETWEEN 0 AND 100),
  PRIMARY KEY(source_id,domain)
);

CREATE TABLE IF NOT EXISTS feeds(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  source_id INTEGER NOT NULL REFERENCES sources(id) ON DELETE CASCADE,
  code TEXT NOT NULL UNIQUE,
  label TEXT NOT NULL,
  provider_type TEXT NOT NULL CHECK(provider_type IN ('RSS','ATOM','API','WEB','SITEMAP','SOCIAL','CALENDAR','MANUAL')),
  endpoint TEXT,
  platform TEXT,
  account_identifier TEXT,
  enabled INTEGER NOT NULL DEFAULT 0 CHECK(enabled IN (0,1)),
  poll_interval_sec INTEGER NOT NULL DEFAULT 900 CHECK(poll_interval_sec BETWEEN 60 AND 86400),
  base_importance INTEGER NOT NULL DEFAULT 50 CHECK(base_importance BETWEEN 0 AND 100),
  content_role TEXT NOT NULL DEFAULT 'ORIGINAL' CHECK(content_role IN ('ORIGINAL','CONFIRMATION','RELAY','COMMENTARY','MIXED')),
  content_class TEXT NOT NULL DEFAULT 'INFORMATION' CHECK(content_class IN ('INFORMATION','PREDICTION','REFLECTION','MIXED')),
  status TEXT NOT NULL DEFAULT 'IDLE',
  last_checked_at TEXT,
  last_success_at TEXT,
  last_error TEXT,
  last_duration_ms INTEGER,
  last_received_count INTEGER,
  last_transport TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS raw_items(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  feed_id INTEGER NOT NULL REFERENCES feeds(id) ON DELETE CASCADE,
  external_id TEXT NOT NULL,
  url TEXT,
  title TEXT NOT NULL,
  summary TEXT,
  author TEXT,
  published_at TEXT,
  collected_at TEXT NOT NULL,
  content_hash TEXT NOT NULL,
  language TEXT,
  UNIQUE(feed_id,external_id),
  UNIQUE(feed_id,content_hash)
);

CREATE TABLE IF NOT EXISTS events(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  event_key TEXT NOT NULL UNIQUE,
  event_type TEXT NOT NULL CHECK(event_type IN ('INFORMATION','PREDICTION','REFLECTION')),
  status TEXT NOT NULL CHECK(status IN ('UNCLASSIFIED','UNCONFIRMED','CONFIRMED','CONTRADICTED')),
  title TEXT NOT NULL,
  occurred_at TEXT,
  first_seen_at TEXT NOT NULL,
  source_reliability REAL,
  event_confidence REAL,
  market_relevance REAL,
  expected_impact REAL,
  direction TEXT NOT NULL DEFAULT 'UNKNOWN' CHECK(direction IN ('POSITIVE','NEGATIVE','NEUTRAL','MIXED','UNKNOWN')),
  horizon TEXT,
  conflict_score REAL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS event_domains(
  event_id INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  domain TEXT NOT NULL CHECK(domain IN ('MACRO','MONETARY','MARKET_RISK','REGULATION','CRYPTO_NETWORK','ADOPTION','SECURITY')),
  PRIMARY KEY(event_id,domain)
);

CREATE TABLE IF NOT EXISTS event_sources(
  event_id INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  raw_item_id INTEGER NOT NULL REFERENCES raw_items(id) ON DELETE CASCADE,
  source_id INTEGER NOT NULL REFERENCES sources(id) ON DELETE CASCADE,
  relation TEXT NOT NULL CHECK(relation IN ('ORIGINAL','CONFIRMATION','RELAY','COMMENTARY')),
  independent INTEGER NOT NULL DEFAULT 0 CHECK(independent IN (0,1)),
  PRIMARY KEY(event_id,raw_item_id)
);

CREATE INDEX IF NOT EXISTS idx_sources_grade ON sources(grade,priority);
CREATE INDEX IF NOT EXISTS idx_source_domains_domain ON source_domains(domain,competence DESC);
CREATE INDEX IF NOT EXISTS idx_feeds_source ON feeds(source_id,enabled);
CREATE INDEX IF NOT EXISTS idx_feeds_status ON feeds(enabled,status,last_checked_at);
CREATE INDEX IF NOT EXISTS idx_raw_published ON raw_items(published_at DESC);
CREATE INDEX IF NOT EXISTS idx_raw_feed_published ON raw_items(feed_id,published_at DESC);
CREATE INDEX IF NOT EXISTS idx_raw_hash ON raw_items(content_hash);
CREATE INDEX IF NOT EXISTS idx_events_seen ON events(first_seen_at DESC,status);
CREATE INDEX IF NOT EXISTS idx_event_sources_event ON event_sources(event_id,source_id,independent);

-- FedWatch local snapshots. Stores the complete normalized calculation/validation packet
-- so IA-TB can compare changes over time without re-querying third-party pages.
CREATE TABLE IF NOT EXISTS fedwatch_snapshots(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  fingerprint TEXT NOT NULL UNIQUE,
  generated_at TEXT NOT NULL,
  next_meeting_date TEXT,
  effr REAL,
  target_low REAL,
  target_high REAL,
  payload_json TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_fedwatch_generated ON fedwatch_snapshots(generated_at DESC);
CREATE INDEX IF NOT EXISTS idx_fedwatch_meeting ON fedwatch_snapshots(next_meeting_date,generated_at DESC);

-- v1.6.2: configuration des providers WEB + cache de traduction.
CREATE TABLE IF NOT EXISTS provider_configs(
  feed_id INTEGER PRIMARY KEY REFERENCES feeds(id) ON DELETE CASCADE,
  config_json TEXT NOT NULL DEFAULT '{}',
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS raw_item_translations(
  raw_item_id INTEGER NOT NULL REFERENCES raw_items(id) ON DELETE CASCADE,
  target_lang TEXT NOT NULL CHECK(target_lang IN ('fr','en','es','de')),
  translated_title TEXT NOT NULL,
  translated_summary TEXT,
  provider TEXT NOT NULL DEFAULT 'MYMEMORY',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY(raw_item_id,target_lang)
);
CREATE INDEX IF NOT EXISTS idx_translations_lang ON raw_item_translations(target_lang,updated_at DESC);


-- v1.6.8 Flux Manager: memorise les flux supprimes pour eviter leur recreation
-- automatique par les seeds au prochain demarrage.
CREATE TABLE IF NOT EXISTS feed_tombstones(
  code TEXT PRIMARY KEY,
  deleted_at TEXT NOT NULL
);
