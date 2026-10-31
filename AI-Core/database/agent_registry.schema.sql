-- SQLite central Agent-Registry.db; managed by privileged independent registry service.
PRAGMA foreign_keys=ON;
PRAGMA journal_mode=WAL;
CREATE TABLE IF NOT EXISTS agents (
 serial TEXT PRIMARY KEY,
 pseudonym TEXT NOT NULL,
 role TEXT NOT NULL,
 status TEXT NOT NULL CHECK(status IN ('REGISTERED','DISABLED','ACTIVE','RETIRED')),
 created_at_utc TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
 updated_at_utc TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
 soul_md_relative_path TEXT NOT NULL,
 memory_db_relative_path TEXT NOT NULL,
 events_jsonl_relative_path TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_agents_role_status ON agents(role,status);
